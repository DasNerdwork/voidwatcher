#!/usr/bin/env python3
"""
sync_images.py — VoidWatcher Image Sync

Lädt Item-Bilder von warframe.market/static/assets/, speichert zwei AVIF-Versionen:
  /images/{slug}.avif          → Vollbild  (max 256px, Q85)  für Detailseiten
  /images/thumbs/{slug}.avif   → Thumbnail (max 128px, Q75)  für Tabellen

Fallback-Kette:
  1. WFM static assets  → Primärquelle, enthält Mod-Rahmen etc.
  2. wiki.warframe.com  → Fallback wenn WFM einen Placeholder (~532B) liefert.
                          Slug wird zu WikiTitle konvertiert (galvanized_steel → Galvanized_Steel),
                          Seite wird geparst, main-image extrahiert.
                          Wiki-Bilder haben kein Padding → 5px Padding wird hinzugefügt.

Verwendung:
    python3 sync_images.py                  # alle fehlenden/geänderten
    python3 sync_images.py --force          # alle neu herunterladen
    python3 sync_images.py --limit 50       # nur N Items (zum Testen)
    python3 sync_images.py --dry-run        # nur URLs anzeigen
    python3 sync_images.py --workers 4      # Parallelität (default: 4)
"""

import os
import re
import sys
import time
import logging
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

try:
    from PIL import Image, ImageOps
    import io
    try:
        import pillow_avif  # noqa: F401
    except ImportError:
        pass
except ImportError:
    print("ERROR: Pillow nicht installiert. pip install pillow pillow-avif-plugin --break-system-packages")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR  = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / "../api/.env")

DB_CONFIG = {
    "dbname":   os.getenv("VW_NAME"),
    "user":     os.getenv("VW_USER"),
    "password": os.getenv("VW_PASSWORD"),
    "host":     os.getenv("VW_HOST", "localhost"),
    "port":     int(os.getenv("VW_PORT", 5432)),
}

IMAGE_DIR  = Path(os.getenv("VW_IMAGE_DIR", "/hdd1/warframe/voidwatch/images"))
THUMB_DIR  = IMAGE_DIR / "thumbs"
WFM_STATIC = "https://warframe.market/static/assets"
WIKI_BASE  = "https://wiki.warframe.com"

FULL_SIZE  = 256
FULL_Q     = 85
THUMB_SIZE = 128
THUMB_Q    = 75

# WFM Placeholder-Größe — alles darunter ist kein echtes Bild
WFM_PLACEHOLDER_MAX_BYTES = 1024

# Padding das wiki.warframe.com-Bilder brauchen um WFM-Stil zu matchen (px)
WIKI_PADDING = 5

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s %(message)s",
    datefmt="%d.%m.%Y %H:%M:%S",
)
log = logging.getLogger("sync_images")

# ── DB ────────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=psycopg2.extras.RealDictCursor)


def ensure_columns(conn):
    with conn.cursor() as cur:
        cur.execute("""
            ALTER TABLE market_items
                ADD COLUMN IF NOT EXISTS thumb_path TEXT,
                ADD COLUMN IF NOT EXISTS thumb_hash TEXT,
                ADD COLUMN IF NOT EXISTS image_path TEXT;
        """)
        conn.commit()
    log.info("Columns thumb_path, thumb_hash, image_path verified.")


def get_items_needing_images(conn, force: bool = False, limit: int | None = None) -> list[dict]:
    limit_clause = f"LIMIT {limit}" if limit else ""
    hash_filter  = "" if force else """
        AND (
            mi.thumb_hash IS NULL
            OR mi.thumb_hash != split_part(mi.raw->'i18n'->'en'->>'icon', '/', -1)
        )
    """
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT
                mi.id,
                mi.slug,
                mi.raw->'i18n'->'en'->>'icon' AS icon_path,
                mi.thumb_hash                 AS current_hash
            FROM market_items mi
            WHERE mi.raw->'i18n'->'en'->>'icon' IS NOT NULL
              {hash_filter}
            ORDER BY mi.slug
            {limit_clause}
        """)
        return [dict(r) for r in cur.fetchall()]


def update_item_paths(conn, item_id: str, image_path: str, thumb_path: str, cache_key: str):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE market_items
               SET image_path = %s,
                   thumb_path = %s,
                   thumb_hash = %s
             WHERE id = %s
        """, (image_path, thumb_path, cache_key, item_id))
    conn.commit()


# ── Wiki Fallback ─────────────────────────────────────────────────────────────

# Artikel/Präpositionen die im Wiki-Titel klein geschrieben werden (außer am Anfang)
_SMALL_WORDS = {"of", "the", "a", "an", "in", "on", "at", "to", "and", "or", "for"}

# Suffixe die auf Komponenten/Blueprints hinweisen → Parent-Seite suchen
_COMPONENT_SUFFIXES = (
    "_blueprint", "_barrel", "_receiver", "_stock",
    "_handle", "_blade", "_carapace", "_systems",
    "_neuroptics", "_chassis", "_set",
)


def slug_to_wiki_title(slug: str) -> str:
    """
    galvanized_steel  → Galvanized_Steel
    axi_o6_relic      → Axi_O6          (kein _relic Suffix)
    prey_of_dynar     → Prey_of_Dynar   (Artikel bleiben klein außer erstem Wort)
    cull_the_weak     → Cull_the_Weak
    """
    s = re.sub(r"_relic$", "", slug)
    words = s.split("_")
    result = []
    for i, w in enumerate(words):
        result.append(w if (i > 0 and w in _SMALL_WORDS) else w.capitalize())
    return "_".join(result)


def slug_to_parent_title(slug: str) -> str | None:
    """
    epitaph_prime_barrel    → Epitaph_Prime
    caliban_prime_blueprint → Caliban_Prime
    Returns None if no known component suffix found.
    """
    for suffix in _COMPONENT_SUFFIXES:
        if slug.endswith(suffix):
            parent = slug[: -len(suffix)]
            return slug_to_wiki_title(parent)
    return None


def extract_foundrytable_image(html: str, component_hint: str) -> str | None:
    """
    Sucht in einem foundrytable-Block nach einem Bild das zum Komponenten-Typ passt.
    /images/thumb/GenericGunPrimeBarrel.png/32px-... → /images/GenericGunPrimeBarrel.png

    component_hint: z.B. "barrel", "receiver", "blueprint", "neuroptics" …
    """
    # Alle thumb-Bilder aus der Seite extrahieren
    matches = re.findall(r'/images/thumb/([^/]+\.png)/\d+px-', html)
    if not matches:
        return None

    hint = component_hint.lower()
    # Versuche zuerst einen Treffer der den Hint enthält
    for fname in matches:
        if hint in fname.lower():
            return fname
    # Fallback: erstes Bild im foundrytable
    ft = re.search(r'class="foundrytable".*?/images/thumb/([^/]+\.png)/\d+px-', html, re.DOTALL)
    if ft:
        return ft.group(1)
    return None


WFM_PLACEHOLDER_HASH = "a81cadf3c1f6e67c92c188534ced77b2"
WFM_API_BASE         = "https://api.warframe.market/v2"


def fetch_wfm_set(slug: str, timeout: int = 15) -> tuple[bytes | None, str | None]:
    """
    Ruft /v2/item/{slug}/set auf.
    Gibt zurück: (icon_bytes | None, wiki_link | None)
      - icon_bytes: erstes echtes Icon aus dem Set (nicht Placeholder)
      - wiki_link:  wikiLink aus dem ersten Item das eines hat
    """
    try:
        r = requests.get(
            f"{WFM_API_BASE}/item/{slug}/set",
            timeout=timeout,
            headers={"User-Agent": "VoidWatcher/1.0", "accept": "application/json"},
        )
        if r.status_code != 200:
            return None, None

        items = (r.json().get("data") or {}).get("items") or []
        found_bytes: bytes | None = None
        found_wiki:  str | None  = None

        for item in items:
            i18n_en = (item.get("i18n") or {}).get("en", {})

            # wikiLink sammeln (erstes gefundenes)
            if not found_wiki:
                found_wiki = i18n_en.get("wikiLink") or None

            # Echtes Icon suchen
            if not found_bytes:
                icon_path = i18n_en.get("icon", "")
                if icon_path and WFM_PLACEHOLDER_HASH not in icon_path:
                    url = f"{WFM_STATIC}/{icon_path}"
                    img_r = requests.get(url, timeout=timeout,
                                         headers={"User-Agent": "VoidWatcher/1.0"})
                    if img_r.status_code == 200 and len(img_r.content) >= WFM_PLACEHOLDER_MAX_BYTES:
                        found_bytes = img_r.content

        return found_bytes, found_wiki
    except Exception:
        pass
    return None, None


def _fetch_page(url: str, timeout: int = 15) -> str | None:
    """Lädt eine Wiki-Seite und gibt den HTML-Text zurück, oder None."""
    try:
        r = requests.get(url, timeout=timeout, headers={
            "User-Agent": "VoidWatcher/1.0",
            "Accept": "text/html",
        })
        return r.text if r.status_code == 200 else None
    except Exception:
        return None


def _download_image(img_path: str, timeout: int = 15) -> bytes | None:
    """Lädt ein Bild von wiki.warframe.com herunter."""
    try:
        r = requests.get(f"{WIKI_BASE}{img_path}", timeout=timeout,
                         headers={"User-Agent": "VoidWatcher/1.0"})
        if r.status_code == 200 and len(r.content) >= 512:
            return r.content
    except Exception:
        pass
    return None


def _extract_main_image(html: str) -> str | None:
    """
    Extrahiert den besten verfügbaren Bildpfad aus dem main-image Block.
    Priorität:
      1. srcset full-res:  srcset="/images/Foo.png?hash 2x"  → /images/Foo.png
      2. File-Href:        href="/w/File:Foo.png"             → /images/Foo.png
      3. src fallback:     src="/images/thumb/Foo.png/300px-" → /images/Foo.png
    """
    block_m = re.search(r'class="main-image"[^>]*>.*?</span>', html, re.DOTALL)
    if not block_m:
        return None
    block = block_m.group(0)

    # 1. srcset: "/images/Foo.png?hash 2x" → /images/Foo.png
    srcset_m = re.search(r'srcset="(/images/[^"?]+)', block)
    if srcset_m:
        return srcset_m.group(1)

    # 2. File href: href="/w/File:Foo.png" → /images/Foo.png
    file_m = re.search(r'href="/w/File:([^"]+)"', block)
    if file_m:
        return f"/images/{file_m.group(1)}"

    # 3. src fallback: strip thumb path
    src_m = re.search(r'src="/images/thumb/([^/]+)/\d+px-', block)
    if src_m:
        return f"/images/{src_m.group(1)}"

    # 4. plain src
    plain_m = re.search(r'src="(/images/[^"?]+)', block)
    return plain_m.group(1) if plain_m else None


def _try_wiki_page(url: str, slug: str, timeout: int) -> bytes | None:
    """Lädt eine Wiki-Seite und versucht das main-image zu extrahieren."""
    html = _fetch_page(url, timeout)
    if not html:
        return None
    img_path = _extract_main_image(html)
    if img_path:
        data = _download_image(img_path, timeout)
        if data:
            return data
    # Foundrytable-Fallback für Komponenten
    for suffix in _COMPONENT_SUFFIXES:
        if slug.endswith(suffix):
            hint = suffix.lstrip("_")
            fname = extract_foundrytable_image(html, hint)
            if fname:
                return _download_image(f"/images/{fname}", timeout)
    return None


def fetch_wiki_image(slug: str, timeout: int = 15, wiki_url: str | None = None) -> bytes | None:
    """
    Wiki-Bild-Kette für einen Slug:
      1. Direkt-URL-Guess: /images/{Title}.png  (oft funktioniert das ohne Seitenaufruf)
      2. Explizite wiki_url (aus WFM-Set-Response)  → main-image
      3. Slug → Wiki-Titel → Seite                  → main-image
      4. Parent-Seite (Komponenten)                 → main-image / foundrytable
    """
    title = slug_to_wiki_title(slug)

    # ── 1. Direkt-URL-Guess ───────────────────────────────────────────────────
    # Reihenfolge: "Mod"-Variante zuerst (GalvanizedChamberMod.png > GalvanizedChamber.png),
    # dann Arcane/Standard-Variante.
    # Zwei Schreibweisen: mit Underscores und CamelCase.
    camel = "".join(w.capitalize() for w in slug.split("_"))
    for fname in (
        f"{camel}Mod.png",      # GalvanizedChamberMod.png  ← Mod-Karte (bevorzugt)
        f"{camel}.png",         # ArcaneAvenger.png / GalvanizedChamber.png
        f"{title}Mod.png",      # Galvanized_ChamberMod.png (selten)
        f"{title}.png",         # Galvanized_Chamber.png
    ):
        direct = _download_image(f"/images/{fname}", timeout)
        if direct:
            return direct

    # ── 2. Explizite Wiki-URL aus WFM-Set ─────────────────────────────────────
    if wiki_url:
        # https://wiki.warframe.com/w/Secondary_Enervate → direkt fetchen
        data = _try_wiki_page(wiki_url, slug, timeout)
        if data:
            return data

    # ── 3. Slug → Wiki-Titel → Seite ─────────────────────────────────────────
    data = _try_wiki_page(f"{WIKI_BASE}/w/{title}", slug, timeout)
    if data:
        return data

    # ── 4. Parent-Seite für Komponenten ──────────────────────────────────────
    parent_title = slug_to_parent_title(slug)
    if parent_title:
        data = _try_wiki_page(f"{WIKI_BASE}/w/{parent_title}", slug, timeout)
        if data:
            return data

    return None


def add_padding(img: Image.Image, padding: int) -> Image.Image:
    """Fügt padding px transparenten Rand auf allen Seiten hinzu."""
    new_w = img.width  + padding * 2
    new_h = img.height + padding * 2
    padded = Image.new("RGBA", (new_w, new_h), (0, 0, 0, 0))
    padded.paste(img, (padding, padding))
    return padded


# ── Download + Convert ────────────────────────────────────────────────────────

def download_and_convert(
    item: dict,
    timeout: int = 20,
    max_retries: int = 3,
) -> tuple[bool, str, str]:
    """
    Lädt das Bild herunter (WFM → wiki Fallback), speichert Full + Thumb als AVIF.
    Returns (success, message, status) — status: 'ok' | 'ok_wiki' | '404' | 'placeholder' | 'error'
    """
    slug      = item["slug"]
    icon_path = item["icon_path"]
    url       = f"{WFM_STATIC}/{icon_path}"
    full_out  = IMAGE_DIR / f"{slug}.avif"
    thumb_out = THUMB_DIR  / f"{slug}.avif"

    raw_bytes  = None
    source     = "wiki"

    # ── Versuch 1: wiki.warframe.com (bevorzugt — höhere Qualität, korrekte Bilder) ──
    # Erst WFM-Set anfragen um ggf. den wikiLink zu bekommen, dann Wiki
    wfm_set_bytes, wfm_wiki_url = fetch_wfm_set(slug, timeout=timeout)
    wiki_bytes = fetch_wiki_image(slug, timeout=timeout, wiki_url=wfm_wiki_url)
    if wiki_bytes:
        raw_bytes = wiki_bytes

    # ── Versuch 2: WFM /set Icon (bereits abgerufen in Schritt 1) ───────────
    if raw_bytes is None and wfm_set_bytes:
        raw_bytes = wfm_set_bytes
        source    = "wfm_set"

    # ── Versuch 3: WFM direkt ─────────────────────────────────────────────────
    if raw_bytes is None:
        source = "wfm"
        for attempt in range(1, max_retries + 1):
            try:
                time.sleep(0.1)
                r = requests.get(url, timeout=timeout, headers={"User-Agent": "VoidWatcher/1.0"})

                if r.status_code == 429:
                    wait = 2 ** attempt
                    log.warning(f"  429 für {slug} (Versuch {attempt}), warte {wait}s…")
                    time.sleep(wait)
                    continue

                if r.status_code == 404:
                    break

                r.raise_for_status()

                if len(r.content) < WFM_PLACEHOLDER_MAX_BYTES:
                    break  # Placeholder — kein brauchbares Bild

                raw_bytes = r.content
                break

            except Exception:
                if attempt == max_retries:
                    break
                time.sleep(2 ** attempt)

    if raw_bytes is None:
        return False, f"Kein Bild gefunden (WFM Placeholder + Wiki fehlgeschlagen)", "placeholder"

    # ── Bild verarbeiten ──────────────────────────────────────────────────────
    try:
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")

        # Wiki-Bilder brauchen 5px Padding um WFM-Stil zu matchen
        # WFM-Bilder (direkt oder via Set) haben bereits das korrekte Padding
        if source == "wiki":
            img = add_padding(img, WIKI_PADDING)

        # Vollbild
        full_img = img.copy()
        full_img.thumbnail((FULL_SIZE, FULL_SIZE), Image.LANCZOS)
        full_img.save(full_out, format="AVIF", quality=FULL_Q)

        # Thumbnail
        thumb_img = img.copy()
        thumb_img.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        thumb_img.save(thumb_out, format="AVIF", quality=THUMB_Q)

        full_kb  = full_out.stat().st_size  // 1024
        thumb_kb = thumb_out.stat().st_size // 1024
        dim      = f"{full_img.width}×{full_img.height}"
        status   = "ok_wiki" if source == "wiki" else "ok"
        label    = f"OK [{source}] {dim} full={full_kb}KB thumb={thumb_kb}KB"
        return True, label, status

    except Exception as e:
        return False, f"Bild-Verarbeitung fehlgeschlagen: {e}", "error"


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="VoidWatcher Image Sync")
    p.add_argument("--force",   action="store_true", help="Alle Bilder neu herunterladen")
    p.add_argument("--limit",   type=int, default=None, help="Nur N Items verarbeiten")
    p.add_argument("--workers", type=int, default=4,    help="Parallele Downloads (default: 4)")
    p.add_argument("--dry-run", action="store_true",    help="Nur URLs anzeigen")
    return p.parse_args()


def run(conn=None, force=False, workers=4, limit=None, dry_run=False):
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    THUMB_DIR.mkdir(parents=True, exist_ok=True)
    log.info(f"Image dir:  {IMAGE_DIR}")
    log.info(f"Thumb dir:  {THUMB_DIR}")
    log.info(f"Settings: full={FULL_SIZE}px Q{FULL_Q}, thumb={THUMB_SIZE}px Q{THUMB_Q}, workers={workers}, force={force}")

    own_conn = conn is None
    if own_conn:
        conn = get_conn()

    try:
        ensure_columns(conn)

        items = get_items_needing_images(conn, force=force, limit=limit)
        log.info(f"Items die Bilder brauchen: {len(items)}")

        if not items:
            log.info("Nichts zu tun.")
            return

        if dry_run:
            for item in items[:20]:
                log.info(f"  {item['slug']} → {WFM_STATIC}/{item['icon_path']}")
            if len(items) > 20:
                log.info(f"  … und {len(items) - 20} weitere")
            return

        ok_count = wiki_count = fail_count = not_found_count = 0
        start = time.time()

        def process(item):
            success, msg, status = download_and_convert(item)
            if success:
                cache_key = item["icon_path"].split("/")[-1]
                update_item_paths(
                    conn,
                    item["id"],
                    image_path=f"/images/{item['slug']}.avif",
                    thumb_path=f"/images/thumbs/{item['slug']}.avif",
                    cache_key=cache_key,
                )
            return item["slug"], success, msg, status

        with ThreadPoolExecutor(max_workers=workers) as ex:
            futures = {ex.submit(process, item): item for item in items}
            for i, fut in enumerate(as_completed(futures), 1):
                slug, success, msg, status = fut.result()
                if success:
                    ok_count += 1
                    if status == "ok_wiki":
                        wiki_count += 1
                    if i % 25 == 0 or i <= 5 or i == len(items):
                        log.info(f"  [{i}/{len(items)}] ✓ {slug}: {msg}")
                elif status in ("placeholder", "404"):
                    not_found_count += 1
                    log.debug(f"  [{i}/{len(items)}] ⊘ {slug}: {msg}")
                else:
                    fail_count += 1
                    log.warning(f"  [{i}/{len(items)}] ✗ {slug}: {msg}")

        full_mb  = _dir_size_mb(IMAGE_DIR, exclude=THUMB_DIR)
        thumb_mb = _dir_size_mb(THUMB_DIR)
        elapsed  = time.time() - start
        log.info(
            f"Fertig in {elapsed:.1f}s — "
            f"OK: {ok_count} (davon Wiki: {wiki_count}), "
            f"Kein Bild: {not_found_count}, Fehler: {fail_count} | "
            f"Full: {full_mb:.1f}MB, Thumbs: {thumb_mb:.1f}MB"
        )

    finally:
        if own_conn:
            conn.close()


def _dir_size_mb(path: Path, exclude: Path | None = None) -> float:
    total = 0
    for f in path.rglob("*"):
        if f.is_file():
            if exclude and f.is_relative_to(exclude):
                continue
            total += f.stat().st_size
    return total / 1_048_576


if __name__ == "__main__":
    args = parse_args()
    run(
        force=args.force,
        workers=args.workers,
        limit=args.limit,
        dry_run=args.dry_run,
    )