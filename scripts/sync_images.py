#!/usr/bin/env python3
"""
sync_images.py — VoidWatcher Image Sync

Lädt Item-Bilder von warframe.market/static/assets/, speichert zwei AVIF-Versionen:
  /images/{slug}.avif          → Vollbild  (max 256px, Q85)  für Detailseiten
  /images/thumbs/{slug}.avif   → Thumbnail (max 128px, Q75)  für Tabellen

Fallback-Kette (normale Items):
  1. wiki.warframe.com  → Primärquelle
  2. WFM /set API       → Fallback
  3. WFM static assets  → letzter Ausweg

Relikte Sonderbehandlung (Feature: shared Ären-Bilder):
  Alle Relikte einer Ära sehen identisch aus. Statt per-Slug-Downloads gibt es
  eine shared AVIF pro Ära (lith, meso, neo, axi, requiem):
    /images/relic_{era}.avif  +  /images/thumbs/relic_{era}.avif
  Quelle ist das WFM-Icon des ersten verarbeiteten Items der Ära. Alle
  Relikt-Items der Ära referenzieren in der DB dieselben Pfade.

Prime Warframe Sonderbehandlung (nur wenn 'warframe'-Tag gesetzt):
  - *_prime_chassis[_blueprint]    → shared /images/prime_chassis.avif   (PrimeChassis.png)
  - *_prime_neuroptics[_blueprint] → shared /images/prime_helmet.avif    (PrimeHelmet.png)
  - *_prime_systems[_blueprint]    → shared /images/prime_systems.avif   (PrimeSystems.png)
  - *_prime_blueprint              → individuell {Name}Prime_Thumb.png    (z.B. VorunaPrime_Thumb.png)
  - *_prime_set                    → individuell {Name}PrimeHelmet.png    (z.B. VorunaPrimeHelmet.png)

  Die 3 shared Component-AVIFs werden einmal erzeugt und von allen Warframe-Komponenten-Items
  in der DB referenziert — kein per-Slug-Duplikat, kein Symlink.

Verwendung:
    python3 sync_images.py                  # alle fehlenden/geänderten
    python3 sync_images.py --force          # alle neu herunterladen
    python3 sync_images.py --limit 50       # nur N Items (zum Testen)
    python3 sync_images.py --dry-run        # nur URLs anzeigen
    python3 sync_images.py --workers 4      # Parallelität (default: 4)
"""

import io
import json
import os
import re
import sys
import time
import logging
import argparse
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
import psycopg2.extras

# Läuft aus sync_api.py heraus im selben Prozess und teilt sich dadurch dasselbe
# 3/s-Budget — vorher konnte der Bildabgleich es zusätzlich belasten.
from wfm_http import market_get, plain_get
from dotenv import load_dotenv

try:
    from PIL import Image
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

WFM_PLACEHOLDER_MAX_BYTES = 1024
WIKI_PADDING = 5

# ── Prime Warframe Shared Component Images ────────────────────────────────────
#
# Mapping: Komponenten-Typ → (Wiki-Quelldatei, lokaler AVIF-Stem ohne Extension)
# Die shared AVIFs landen direkt in IMAGE_DIR / THUMB_DIR.
# In der DB zeigen alle zugehörigen Items auf diese Pfade — keine Slug-Kopien.

_PRIME_COMPONENT_FILES: dict[str, tuple[str, str]] = {
    "chassis":    ("PrimeChassis.png", "prime_chassis"),
    "neuroptics": ("PrimeHelmet.png",  "prime_helmet"),
    "systems":    ("PrimeSystems.png", "prime_systems"),
}

# Thread-sicherer "bereits gespeichert"-Guard
_PRIME_COMPONENT_READY: set[str] = set()
_PRIME_COMPONENT_LOCK  = threading.Lock()

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
                mi.thumb_hash                  AS current_hash,
                mi.raw->>'tags'                AS tags
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


# ── Prime Warframe Detection ──────────────────────────────────────────────────

def _parse_tags(tags_raw) -> set[str]:
    if not tags_raw:
        return set()
    if isinstance(tags_raw, list):
        return {str(t).lower() for t in tags_raw}
    try:
        return {str(t).lower() for t in json.loads(tags_raw)}
    except Exception:
        return {t.strip().lower() for t in str(tags_raw).split(",") if t.strip()}


def detect_prime_warframe_type(slug: str, tags_raw) -> str | None:
    """
    Gibt den Sondertyp zurück wenn es sich um einen Prime Warframe handelt:
      'chassis' | 'neuroptics' | 'systems' | 'blueprint' | 'set' | None

    Erkennung ausschließlich via 'warframe'-Tag — Waffen wie Bo Prime, Ankylos Prime
    haben diesen Tag nicht und fallen durch.

    Reihenfolge wichtig: Komponenten zuerst, dann blueprint, dann set.
    """
    tags = _parse_tags(tags_raw)
    if "warframe" not in tags or "prime" not in tags:
        return None

    # Komponenten (mit und ohne _blueprint-Suffix)
    for comp in ("chassis", "neuroptics", "systems"):
        if slug.endswith(f"_prime_{comp}") or slug.endswith(f"_prime_{comp}_blueprint"):
            return comp

    # Haupt-Blueprint des Warframes: voruna_prime_blueprint
    if slug.endswith("_prime_blueprint"):
        return "blueprint"

    # Set
    if slug.endswith("_prime_set") or (slug.endswith("_prime") and "set" in tags):
        return "set"

    return None


def prime_component_db_paths(wf_type: str) -> tuple[str, str]:
    """Gibt (image_path, thumb_path) für die shared Component-AVIFs zurück."""
    _, stem = _PRIME_COMPONENT_FILES[wf_type]
    return f"/images/{stem}.avif", f"/images/thumbs/{stem}.avif"


def slug_to_warframe_camel(slug: str) -> str:
    """
    voruna_prime_blueprint → 'VorunaPrime'
    ash_prime_set          → 'AshPrime'
    Strippt alles nach '_prime' weg und camelcased den Rest.
    """
    # Alles bis einschließlich '_prime' behalten
    m = re.match(r"^(.+_prime)(?:_|$)", slug)
    base = m.group(1) if m else slug
    return "".join(p.capitalize() for p in base.split("_"))


def wiki_image_filename(wf_type: str, slug: str) -> str:
    """
    Gibt den Wiki-Dateinamen für den jeweiligen Warframe-Typ zurück.
      blueprint → VorunaPrime_Thumb.png
      set       → VorunaPrimeHelmet.png
    """
    camel = slug_to_warframe_camel(slug)
    if wf_type == "blueprint":
        return f"{camel}_Thumb.png"
    if wf_type == "set":
        return f"{camel}Helmet.png"
    return ""


# ── Prime Component: einmalig herunterladen und als shared AVIF speichern ─────

def ensure_prime_component_avif(wf_type: str, timeout: int = 15, force: bool = False) -> bool:
    """
    Stellt sicher dass die shared AVIF-Datei für diesen Komponenten-Typ existiert.
    Wird nur einmal pro Run ausgeführt (danach im _PRIME_COMPONENT_READY-Set).
    Gibt True zurück wenn die Datei vorhanden/erfolgreich erstellt wurde.
    """
    with _PRIME_COMPONENT_LOCK:
        if wf_type in _PRIME_COMPONENT_READY:
            return True

    wiki_fname, stem = _PRIME_COMPONENT_FILES[wf_type]
    full_out  = IMAGE_DIR / f"{stem}.avif"
    thumb_out = THUMB_DIR  / f"{stem}.avif"

    if not force and full_out.exists() and thumb_out.exists():
        with _PRIME_COMPONENT_LOCK:
            _PRIME_COMPONENT_READY.add(wf_type)
        log.info(f"  Prime component [{wf_type}]: shared AVIF already exists, skipping.")
        return True

    raw_bytes = _download_image(f"/images/{wiki_fname}", timeout)
    if not raw_bytes:
        html = _fetch_page(f"{WIKI_BASE}/w/File:{wiki_fname}", timeout)
        if html:
            m = re.search(r'href="(/images/[^"]+\.png)"[^>]*>\s*(?:Full|Original)', html)
            if not m:
                m = re.search(r'<div class="fullMedia".*?href="(/images/[^"]+)"', html, re.DOTALL)
            if m:
                raw_bytes = _download_image(m.group(1), timeout)

    if not raw_bytes:
        log.warning(f"  Prime component [{wf_type}]: Bild nicht gefunden ({wiki_fname})")
        return False

    try:
        img = add_padding(Image.open(io.BytesIO(raw_bytes)).convert("RGBA"), WIKI_PADDING)

        full_img = img.copy()
        full_img.thumbnail((FULL_SIZE, FULL_SIZE), Image.LANCZOS)
        full_img.save(full_out, format="AVIF", quality=FULL_Q)

        thumb_img = img.copy()
        thumb_img.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        thumb_img.save(thumb_out, format="AVIF", quality=THUMB_Q)

        log.info(f"  Prime component [{wf_type}]: shared AVIF gespeichert → {full_out.name}")
        with _PRIME_COMPONENT_LOCK:
            _PRIME_COMPONENT_READY.add(wf_type)
        return True

    except Exception as e:
        log.warning(f"  Prime component [{wf_type}]: Bildverarbeitung fehlgeschlagen: {e}")
        return False


def fetch_prime_warframe_image(wf_type: str, slug: str, timeout: int = 15) -> bytes | None:
    """
    Lädt das individuelle Bild für einen Prime Warframe Blueprint oder Set.
      blueprint → {Name}Prime_Thumb.png
      set       → {Name}PrimeHelmet.png
    Versucht direkten Download, kein HTML-Parsing nötig.
    """
    fname = wiki_image_filename(wf_type, slug)
    if not fname:
        return None
    url = f"{WIKI_BASE}/images/{fname}"
    log.info(f"  fetch_prime_warframe_image: GET {url}")
    data = _download_image(f"/images/{fname}", timeout)
    if data:
        log.debug(f"  {slug} [{wf_type}]: Wiki direct → {fname}")
    else:
        log.info(f"  fetch_prime_warframe_image: FEHLGESCHLAGEN für {fname}")
    return data


# ── Relic Shared Images ───────────────────────────────────────────────────────
#
# Alle Relikte einer Ära sehen identisch aus. Statt pro Slug ein Bild zu laden,
# gibt es eine shared AVIF pro Ära:
#   /images/relic_{era}.avif  +  /images/thumbs/relic_{era}.avif
# Quelle: WFM static icon des jeweils ersten verarbeiteten Items dieser Ära.
# In der DB zeigen alle Relikte der Ära auf diese Pfade — keine Slug-Kopien.

_RELIC_ERAS = ("lith", "meso", "neo", "axi", "requiem")

# Wiki-Quelldateien für die shared Ären-Bilder — bewusst die Intact-Variante.
# WFM liefert in seinen Icons fälschlich die Radiant-Optik (leuchtende
# Reactant-Punkte), die Wiki-Intact-Bilder zeigen den Basiszustand.
_RELIC_WIKI_FILES: dict[str, str] = {
    "lith":    "LithRelicIntact.png",
    "meso":    "MesoRelicIntact.png",
    "neo":     "NeoRelicIntact.png",
    "axi":     "AxiRelicIntact.png",
    "requiem": "RequiemRelicIntact.png",
}

# Sonder-Relikte mit eigenem Look — kein Sharing, normale per-Slug-Pipeline:
#   - Requiem Eterna (ersetzt seit 2026 Requiem I-IV, eigenes Design,
#     WFM-Icon ist unknown.png → Bild kommt via Wiki)
# Hinweis: Vanguard-Relikte (Prime Resurgence) sehen laut Wiki exakt wie
# normale Axi-Relikte aus (AxiRelicIntact.png) und nutzen daher das shared Bild.
_RELIC_SHARED_EXCLUDE_SLUGS: set[str] = {"requiem_eterna_relic"}

# Thread-sicherer "bereits gespeichert"-Guard (analog zu Prime Components)
_RELIC_READY: set[str] = set()
_RELIC_LOCK  = threading.Lock()


def detect_relic_era(slug: str, tags_raw) -> str | None:
    """
    Gibt die Relikt-Ära zurück ('lith' | 'meso' | 'neo' | 'axi' | 'requiem')
    oder None wenn das Item kein Relikt ist oder keiner Ära zuordenbar.

    Erkennung primär über Tags (z.B. ["relic", "neo"]), Slug-Präfix als Fallback.
    Sonder-Relikte (Requiem Eterna) geben None zurück und laufen durch die
    normale per-Slug-Pipeline.
    """
    tags = _parse_tags(tags_raw)
    if "relic" not in tags:
        return None
    if slug in _RELIC_SHARED_EXCLUDE_SLUGS:
        return None
    for era in _RELIC_ERAS:
        if era in tags or slug.startswith(f"{era}_"):
            return era
    return None


def relic_db_paths(era: str) -> tuple[str, str]:
    """Gibt (image_path, thumb_path) für die shared Relikt-AVIFs zurück."""
    return f"/images/relic_{era}.avif", f"/images/thumbs/relic_{era}.avif"


def ensure_relic_avif(era: str, slug: str, icon_path: str, timeout: int = 15, force: bool = False) -> bool:
    """
    Stellt sicher dass die shared AVIF für diese Ära existiert.

    Quellen (in dieser Reihenfolge):
      1. Wiki {Era}RelicIntact.png — Basiszustand, gewollte Optik
      2. WFM-Icon des aufrufenden Items — zeigt fälschlich Radiant, nur Fallback
      3. Wiki-Pipeline des Items als letzter Ausweg

    Die gesamte Erzeugung läuft unter _RELIC_LOCK, damit nicht mehrere
    Threads gleichzeitig dieselbe Datei schreiben.
    """
    with _RELIC_LOCK:
        if era in _RELIC_READY:
            return True

        full_out  = IMAGE_DIR / f"relic_{era}.avif"
        thumb_out = THUMB_DIR  / f"relic_{era}.avif"

        if not force and full_out.exists() and thumb_out.exists():
            _RELIC_READY.add(era)
            return True

        raw_bytes: bytes | None = None
        source = "wiki_intact"

        # 1) Wiki Intact-Bild direkt (Basiszustand, gewollte Optik)
        wiki_fname = _RELIC_WIKI_FILES.get(era, "")
        if wiki_fname:
            raw_bytes = _download_image(f"/images/{wiki_fname}", timeout)

            # 1b) Fallback über die File:-Seite (falls der Direktpfad nicht greift)
            if raw_bytes is None:
                html = _fetch_page(f"{WIKI_BASE}/w/File:{wiki_fname}", timeout)
                if html:
                    m = re.search(r'href="(/images/[^"]+\.png)"[^>]*>\s*(?:Full|Original)', html)
                    if not m:
                        m = re.search(r'<div class="fullMedia".*?href="(/images/[^"]+)"', html, re.DOTALL)
                    if m:
                        raw_bytes = _download_image(m.group(1), timeout)

        # 2) Fallback: WFM static icon — zeigt Radiant statt Intact, besser als nichts
        if raw_bytes is None and icon_path and "unknown" not in icon_path:
            source = "wfm"
            try:
                r = market_get(f"{WFM_STATIC}/{icon_path}", timeout=timeout)
                if r.status_code == 200 and len(r.content) >= WFM_PLACEHOLDER_MAX_BYTES:
                    raw_bytes = r.content
            except Exception:
                pass

        # 3) Letzter Ausweg: Wiki-Pipeline des Items (z.B. wiki.warframe.com/w/Neo_C8)
        if raw_bytes is None:
            source = "wiki"
            raw_bytes = fetch_wiki_image(slug, timeout=timeout)

        if raw_bytes is None:
            log.warning(f"  Relic [{era}]: kein Bild gefunden (Wiki: {wiki_fname}, WFM: {icon_path})")
            return False

        try:
            img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
            if source in ("wiki_intact", "wiki"):
                img = add_padding(trim_transparent(img), WIKI_PADDING)

            full_img = img.copy()
            full_img.thumbnail((FULL_SIZE, FULL_SIZE), Image.LANCZOS)
            full_img.save(full_out, format="AVIF", quality=FULL_Q)

            thumb_img = img.copy()
            thumb_img.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
            thumb_img.save(thumb_out, format="AVIF", quality=THUMB_Q)

            log.info(f"  Relic [{era}]: shared AVIF gespeichert [{source}] → {full_out.name}")
            _RELIC_READY.add(era)
            return True

        except Exception as e:
            log.warning(f"  Relic [{era}]: Bildverarbeitung fehlgeschlagen: {e}")
            return False


# ── Wiki Fallback ─────────────────────────────────────────────────────────────

_SMALL_WORDS = {"of", "the", "a", "an", "in", "on", "at", "to", "and", "or", "for"}

_COMPONENT_SUFFIXES = (
    "_blueprint", "_barrel", "_receiver", "_stock",
    "_handle", "_blade", "_carapace", "_systems",
    "_neuroptics", "_chassis", "_set",
)


def slug_to_wiki_title(slug: str) -> str:
    s = re.sub(r"_relic$", "", slug)
    words = s.split("_")
    result = []
    for i, w in enumerate(words):
        result.append(w if (i > 0 and w in _SMALL_WORDS) else w.capitalize())
    return "_".join(result)


def slug_to_parent_title(slug: str) -> str | None:
    for suffix in _COMPONENT_SUFFIXES:
        if slug.endswith(suffix):
            parent = slug[: -len(suffix)]
            return slug_to_wiki_title(parent)
    return None


def extract_foundrytable_image(html: str, component_hint: str) -> str | None:
    matches = re.findall(r'/images/thumb/([^/]+\.png)/\d+px-', html)
    if not matches:
        return None
    hint = component_hint.lower()
    for fname in matches:
        if hint in fname.lower():
            return fname
    ft = re.search(r'class="foundrytable".*?/images/thumb/([^/]+\.png)/\d+px-', html, re.DOTALL)
    if ft:
        return ft.group(1)
    return None


WFM_PLACEHOLDER_HASH = "a81cadf3c1f6e67c92c188534ced77b2"
WFM_API_BASE         = "https://api.warframe.market/v2"


def fetch_wfm_set(slug: str, timeout: int = 15) -> tuple[bytes | None, str | None]:
    try:
        r = market_get(
            f"{WFM_API_BASE}/item/{slug}/set",
            timeout=timeout,
            headers={"accept": "application/json"},
        )
        if r.status_code != 200:
            return None, None

        items = (r.json().get("data") or {}).get("items") or []
        found_bytes: bytes | None = None
        found_wiki:  str | None  = None

        for item in items:
            i18n_en = (item.get("i18n") or {}).get("en", {})
            if not found_wiki:
                found_wiki = i18n_en.get("wikiLink") or None
            if not found_bytes:
                icon_path = i18n_en.get("icon", "")
                if icon_path and WFM_PLACEHOLDER_HASH not in icon_path:
                    url = f"{WFM_STATIC}/{icon_path}"
                    img_r = market_get(url, timeout=timeout)
                    if img_r.status_code == 200 and len(img_r.content) >= WFM_PLACEHOLDER_MAX_BYTES:
                        found_bytes = img_r.content

        return found_bytes, found_wiki
    except Exception:
        pass
    return None, None


def _fetch_page(url: str, timeout: int = 15) -> str | None:
    try:
        r = plain_get(url, timeout=timeout, headers={"Accept": "text/html"})
        return r.text if r.status_code == 200 else None
    except Exception:
        return None


def _download_image(img_path: str, timeout: int = 15) -> bytes | None:
    try:
        r = plain_get(f"{WIKI_BASE}{img_path}", timeout=timeout)
        if r.status_code == 200 and len(r.content) >= 512:
            return r.content
    except Exception:
        pass
    return None


def _extract_main_image(html: str) -> str | None:
    block_m = re.search(r'class="main-image"[^>]*>.*?</span>', html, re.DOTALL)
    if not block_m:
        return None
    block = block_m.group(0)

    srcset_m = re.search(r'srcset="(/images/[^"?]+)', block)
    if srcset_m:
        return srcset_m.group(1)

    file_m = re.search(r'href="/w/File:([^"]+)"', block)
    if file_m:
        return f"/images/{file_m.group(1)}"

    src_m = re.search(r'src="/images/thumb/([^/]+)/\d+px-', block)
    if src_m:
        return f"/images/{src_m.group(1)}"

    plain_m = re.search(r'src="(/images/[^"?]+)', block)
    return plain_m.group(1) if plain_m else None


def _try_wiki_page(url: str, slug: str, timeout: int) -> bytes | None:
    html = _fetch_page(url, timeout)
    if not html:
        return None
    img_path = _extract_main_image(html)
    if img_path:
        data = _download_image(img_path, timeout)
        if data:
            return data
    for suffix in _COMPONENT_SUFFIXES:
        if slug.endswith(suffix):
            hint = suffix.lstrip("_")
            fname = extract_foundrytable_image(html, hint)
            if fname:
                return _download_image(f"/images/{fname}", timeout)
    return None


def fetch_wiki_image(slug: str, timeout: int = 15, wiki_url: str | None = None) -> bytes | None:
    title = slug_to_wiki_title(slug)
    camel = "".join(w.capitalize() for w in slug.split("_"))
    for fname in (
        f"{camel}Mod.png",
        f"{camel}.png",
        f"{title}Mod.png",
        f"{title}.png",
    ):
        direct = _download_image(f"/images/{fname}", timeout)
        if direct:
            return direct

    if wiki_url:
        data = _try_wiki_page(wiki_url, slug, timeout)
        if data:
            return data

    data = _try_wiki_page(f"{WIKI_BASE}/w/{title}", slug, timeout)
    if data:
        return data

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


def trim_transparent(img: Image.Image) -> Image.Image:
    """
    Schneidet vollständig transparente Ränder weg (Alpha-Bounding-Box).
    Wiki-Bilder haben teils viel Leerraum um das Motiv (z.B. Relikte: Motiv
    belegt nur ~51% der Canvas), WFM-Icons sind eng zugeschnitten. Trim +
    add_padding normalisiert beide Quellen auf dieselbe wirksame Motivgröße.
    """
    bbox = img.getchannel("A").getbbox()
    return img.crop(bbox) if bbox else img


# ── Download + Convert ────────────────────────────────────────────────────────

def download_and_convert(
    item: dict,
    timeout: int = 20,
    max_retries: int = 3,
    force: bool = False,
) -> tuple[bool, str, str]:
    """
    Lädt das Bild herunter und speichert Full + Thumb als AVIF.

    Relikte:
      lith/meso/neo/axi/requiem → shared AVIF pro Ära (einmal erzeugt,
                                  kein per-Slug-File, kein per-Slug-Download)

    Prime Warframe Typen:
      chassis/neuroptics/systems → shared AVIF (einmal erzeugt, kein per-Slug-File)
      blueprint                  → {Name}Prime_Thumb.png   (individuell, slug-spezifisch)
      set                        → {Name}PrimeHelmet.png   (individuell, slug-spezifisch)

    Returns (success, message, status)
    """
    slug      = item["slug"]
    icon_path = item["icon_path"]
    full_out  = IMAGE_DIR / f"{slug}.avif"
    thumb_out = THUMB_DIR  / f"{slug}.avif"

    # ── Relikte: shared AVIF pro Ära ──────────────────────────────────────────
    era = detect_relic_era(slug, item.get("tags"))
    if era:
        if ensure_relic_avif(era, slug, icon_path, timeout=timeout, force=force):
            return True, f"OK [shared:relic_{era}.avif]", "ok"
        # WFM hat (noch) kein Bild → thumb_hash bleibt NULL, Retry beim nächsten Lauf
        return False, f"Relic shared AVIF konnte nicht erstellt werden ({era})", "placeholder"

    wf_type = detect_prime_warframe_type(slug, item.get("tags"))

    # ── Prime Komponenten: shared AVIF sicherstellen ──────────────────────────
    if wf_type in ("chassis", "neuroptics", "systems"):
        ok = ensure_prime_component_avif(wf_type, timeout=timeout, force=force)
        if ok:
            _, stem = _PRIME_COMPONENT_FILES[wf_type]
            return True, f"OK [shared:{stem}.avif]", "ok_wiki"
        return False, f"Prime component AVIF konnte nicht erstellt werden ({wf_type})", "placeholder"

    # ── Prime Blueprint / Set: individuelles Wiki-Bild ────────────────────────
    raw_bytes: bytes | None = None
    source = "wiki"

    if wf_type in ("blueprint", "set"):
        raw_bytes = fetch_prime_warframe_image(wf_type, slug, timeout=timeout)
        source    = "wiki_prime"
        if raw_bytes is None:
            # Fallback auf normale Pipeline
            log.debug(f"  {slug} [{wf_type}]: Wiki-Bild nicht gefunden, fallback auf Standard-Pipeline")
            wf_type = None

    # ── Normale Pipeline ──────────────────────────────────────────────────────
    if wf_type is None:
        source = "wiki"
        wfm_set_bytes, wfm_wiki_url = fetch_wfm_set(slug, timeout=timeout)
        wiki_bytes = fetch_wiki_image(slug, timeout=timeout, wiki_url=wfm_wiki_url)
        if wiki_bytes:
            raw_bytes = wiki_bytes

        if raw_bytes is None and wfm_set_bytes:
            raw_bytes = wfm_set_bytes
            source    = "wfm_set"

        if raw_bytes is None:
            source = "wfm"
            url    = f"{WFM_STATIC}/{icon_path}"
            for attempt in range(1, max_retries + 1):
                try:
                    r = market_get(url, timeout=timeout)
                    if r.status_code == 429:
                        wait = 2 ** attempt
                        log.warning(f"  429 für {slug} (Versuch {attempt}), warte {wait}s…")
                        time.sleep(wait)
                        continue
                    if r.status_code == 404:
                        break
                    r.raise_for_status()
                    if len(r.content) < WFM_PLACEHOLDER_MAX_BYTES:
                        break
                    raw_bytes = r.content
                    break
                except Exception:
                    if attempt == max_retries:
                        break
                    time.sleep(2 ** attempt)

    if raw_bytes is None:
        return False, "Kein Bild gefunden (WFM Placeholder + Wiki fehlgeschlagen)", "placeholder"

    # ── Bild verarbeiten und slug-spezifische AVIF speichern ─────────────────
    try:
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")

        # Wiki-Bilder (alle Quellen außer WFM direct/set) brauchen Padding
        if source in ("wiki", "wiki_prime"):
            img = add_padding(img, WIKI_PADDING)

        full_img = img.copy()
        full_img.thumbnail((FULL_SIZE, FULL_SIZE), Image.LANCZOS)
        full_img.save(full_out, format="AVIF", quality=FULL_Q)

        thumb_img = img.copy()
        thumb_img.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.LANCZOS)
        thumb_img.save(thumb_out, format="AVIF", quality=THUMB_Q)

        full_kb  = full_out.stat().st_size  // 1024
        thumb_kb = thumb_out.stat().st_size // 1024
        dim      = f"{full_img.width}×{full_img.height}"
        status   = "ok_wiki" if source.startswith("wiki") else "ok"
        return True, f"OK [{source}] {dim} full={full_kb}KB thumb={thumb_kb}KB", status

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
                era     = detect_relic_era(item["slug"], item.get("tags"))
                wf_type = detect_prime_warframe_type(item["slug"], item.get("tags"))
                if era:
                    hint = f"[shared] /images/relic_{era}.avif"
                elif wf_type in ("chassis", "neuroptics", "systems"):
                    _, stem = _PRIME_COMPONENT_FILES[wf_type]
                    hint = f"[shared] /images/{stem}.avif"
                elif wf_type in ("blueprint", "set"):
                    fname = wiki_image_filename(wf_type, item["slug"])
                    hint  = f"[wiki_prime] /images/{fname}"
                else:
                    hint = f"[wfm] {WFM_STATIC}/{item['icon_path']}"
                log.info(f"  {item['slug']} → {hint}")
            if len(items) > 20:
                log.info(f"  … und {len(items) - 20} weitere")
            return

        ok_count = wiki_count = fail_count = not_found_count = 0
        start = time.time()

        def process(item):
            success, msg, status = download_and_convert(item, force=force)
            if success:
                era       = detect_relic_era(item["slug"], item.get("tags"))
                wf_type   = detect_prime_warframe_type(item["slug"], item.get("tags"))
                cache_key = item["icon_path"].split("/")[-1]

                # Shared DB-Pfade für Relikte und Prime-Komponenten,
                # slug-spezifisch für alle anderen
                if era:
                    img_path, thumb_path = relic_db_paths(era)
                elif wf_type in ("chassis", "neuroptics", "systems"):
                    img_path, thumb_path = prime_component_db_paths(wf_type)
                else:
                    img_path   = f"/images/{item['slug']}.avif"
                    thumb_path = f"/images/thumbs/{item['slug']}.avif"

                update_item_paths(conn, item["id"],
                                  image_path=img_path,
                                  thumb_path=thumb_path,
                                  cache_key=cache_key)
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