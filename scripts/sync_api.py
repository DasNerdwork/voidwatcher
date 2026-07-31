#!/usr/bin/env python3
import os
import time
import json
import hashlib
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
from psycopg2.extras import execute_values, Json
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv

# Aller ausgehende Verkehr läuft über dieses Modul: User-Agent und die 3/s-Grenze
# von warframe.market sind dort einmal geregelt statt an neun Aufrufstellen.
from wfm_http import market_get, plain_get

# -------------------------
# Logging setup
# -------------------------
BASE_DIR = Path(__file__).resolve().parent
log_dir = BASE_DIR.parent / "log"
log_dir.mkdir(parents=True, exist_ok=True)
log_file = log_dir / "cron.log"

handler = RotatingFileHandler(str(log_file), maxBytes=50 * 1024 * 1024, backupCount=1)
formatter = logging.Formatter(
    '[%(asctime)s] [%(filename)s - %(levelname)s]: %(message)s',
    datefmt='%d.%m.%Y %H:%M:%S'
)
handler.setFormatter(formatter)
logging.basicConfig(level=logging.INFO, handlers=[handler])

# -------------------------
# Configuration / env
# -------------------------
load_dotenv(BASE_DIR / "../api/.env")

DB_CONFIG = {
    'dbname': os.getenv('VW_NAME'),
    'user': os.getenv('VW_USER'),
    'password': os.getenv('VW_PASSWORD'),
    'host': os.getenv('VW_HOST', 'localhost'),
    'port': int(os.getenv('VW_PORT', 5432))
}

MARKET_API_URL  = "https://api.warframe.market/v2/items"
WFPE_BASE_URL   = "https://raw.githubusercontent.com/calamity-inc/warframe-public-export-plus/senpai"

# -------------------------
# Public Export Plus config
# -------------------------

# All available export files in the repo.
# Remove entries you never need to reduce DB size and sync time.
WFPE_EXPORTS = [
    "ExportAbilities",
    "ExportAchievements",
    "ExportAnimals",
    "ExportArcanes",
    "ExportAvionics",
    "ExportBoosterPacks",
    "ExportBoosters",
    "ExportBounties",
    "ExportBundles",
    "ExportChallenges",
    "ExportCodex",
    "ExportCreditBundles",
    "ExportCustoms",
    "ExportDojoRecipes",
    "ExportDrones",
    "ExportEmailItems",
    "ExportEnemies",
    "ExportFactions",
    "ExportFlavour",
    "ExportFocusUpgrades",
    "ExportFusionBundles",
    "ExportGear",
    "ExportImages",
    "ExportIntrinsics",
    "ExportKeys",
    "ExportMisc",
    "ExportMissionTypes",
    "ExportModSet",
    "ExportNightwave",
    "ExportRailjackWeapons",
    "ExportRecipes",
    "ExportRegions",
    "ExportRelics",
    "ExportResources",
    "ExportRewards",
    "ExportSentinels",
    "ExportSyndicates",
    "ExportSystems",
    "ExportTextIcons",
    "ExportTilesets",
    "ExportUpgrades",
    "ExportVendors",
    "ExportVirtuals",
    "ExportWarframes",
    "ExportWeapons",
]

# Per-export field allowlist.
# - Set to a frozenset of field names → only those fields are stored in raw JSONB.
# - Set to None → keep ALL fields (default if export_type not listed here).
# The always-kept fields (uniqueName, name, icon) are added automatically.
# This is your primary knob for keeping the DB lean.
WFPE_FIELD_ALLOWLIST: dict[str, frozenset | None] = {
    "ExportWeapons": frozenset({
        "uniqueName", "name", "description", "icon",
        "masteryReq", "omegaAttenuation",   # riven disposition
        "totalDamage", "damagePerShot", "damagePerSecond",
        "fireRate", "magazineSize", "reloadTime", "multishot",
        "criticalChance", "criticalMultiplier", "procChance",
        "slot", "noise", "trigger", "tags", "behaviours",
        "productCategory", "excludeFromCodex",
    }),
    "ExportWarframes": frozenset({
        "uniqueName", "name", "description", "icon",
        "masteryReq", "health", "shield", "armor", "power",
        "sprintSpeed", "polarities", "aura", "conclave",
        "productCategory", "excludeFromCodex",
    }),
    "ExportUpgrades": frozenset({
        "uniqueName", "name", "description", "icon",
        "rarity", "baseDrain", "fusionLimit", "isAugment",
        "compatName", "polarity", "levelStats",
        "isStarter", "isFrivilous", "excludeFromCodex",
    }),
    "ExportRelics": frozenset({
    "uniqueName", "name", "icon",
    "era", "category", "rewards", "excludeFromCodex",
    "rewardManifest",
    "quality",
    }),
    "ExportArcanes": frozenset({
        "uniqueName", "name", "description", "icon",
        "rarity", "levelStats", "excludeFromCodex",
    }),
    "ExportResources": frozenset({
        "uniqueName", "name", "description", "icon",
        "rarity", "productCategory", "excludeFromCodex",
    }),
    "ExportRecipes": frozenset({
        "uniqueName", "resultType", "icon",
        "buildPrice", "buildTime", "skipBuildTimePrice",
        "ingredients", "secretIngredients",
        "consumeOnUse", "excludeFromCodex",
    }),
    # None = store everything as-is for these:
    "ExportAbilities":      None,
    "ExportAchievements":   None,
    "ExportSentinels":      None,
    "ExportGear":           None,
    "ExportMisc":           None,
    "ExportRewards":        None,
    "ExportVendors":        None,
    "ExportBundles":        None,
    # All other exports also default to None (keep all)
}

WFPE_ALWAYS_KEEP = {"uniqueName", "name", "icon"}  # never stripped, even when allowlist active

# EXCLUSIONS
MARKET_ITEMS_EXCLUDE_PATTERNS = ("_augment_mod", "_armor_set")

# -------------------------
# Helpers
# -------------------------
def json_hash(obj) -> str:
    """Stable MD5 hash of a JSON-serializable object. Used to detect changes."""
    raw = json.dumps(obj, sort_keys=True, ensure_ascii=False)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def apply_field_allowlist(item: dict, export_type: str) -> dict:
    """Strip fields not in the allowlist. Always retains WFPE_ALWAYS_KEEP fields."""
    allowlist = WFPE_FIELD_ALLOWLIST.get(export_type)
    if allowlist is None:
        # Not configured → check default sentinel
        if export_type not in WFPE_FIELD_ALLOWLIST:
            return item   # truly unconfigured → keep everything
        return item       # explicitly None → keep everything
    effective = allowlist | WFPE_ALWAYS_KEEP
    return {k: v for k, v in item.items() if k in effective}


# -------------------------
# Database schema creation
# -------------------------
def create_schema(conn):
    with conn.cursor() as cur:
        # items — normalized market data with JSONB raw copy
        cur.execute("""
            CREATE TABLE IF NOT EXISTS market_items (
                id         TEXT PRIMARY KEY,
                slug       TEXT UNIQUE,
                game_ref   TEXT,
                i18n       JSONB,
                tags       JSONB,
                ducats     INT,
                max_rank   INT,
                price_median NUMERIC,
                -- Bildpfade: kamen über sync_images dazu und fehlten hier, eine
                -- Neuinstallation wich dadurch von der migrierten DB ab.
                thumb_path  TEXT,
                thumb_hash  TEXT,
                image_path  TEXT,
                -- Niedrigstes Verkaufsangebot für Items ohne Handelsdaten,
                -- siehe migrations/008. Ein Angebot ist kein Handelspreis und
                -- wird in der Oberfläche getrennt ausgewiesen.
                sell_price_min    NUMERIC,
                sell_price_rank   INTEGER,
                sell_price_status TEXT,
                sell_orders_at    TIMESTAMPTZ,
                raw        JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_items_slug      ON market_items (slug);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_items_tags      ON market_items USING GIN (tags);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_items_i18n_en_name ON market_items ((raw->'i18n'->'en'->>'name'));")
        # Zweiter Sprachzweig, siehe migrations/010: die Suche filtert über beide
        # Namen, damit „Einkerbung" dasselbe findet wie „Serration".
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_items_i18n_de_name ON market_items ((raw->'i18n'->'de'->>'name'));")

        # Vorberechnete Ranglisten — siehe migrations/008_precomputed_tops.sql.
        # payload als JSONB, damit ein neues Feld in der Rangliste keine Migration
        # erzwingt; source_updated ist der Frischeschutz gegen veraltete Stände.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS top_lists (
                hours          INTEGER     NOT NULL,
                tag            TEXT,
                metric         TEXT        NOT NULL,
                list_kind      TEXT        NOT NULL,
                rank           INTEGER     NOT NULL,
                payload        JSONB       NOT NULL,
                source_updated TIMESTAMPTZ NOT NULL
            );
        """)
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS top_lists_key ON top_lists (hours, COALESCE(tag, ''), metric, list_kind, rank);")
        cur.execute("CREATE INDEX IF NOT EXISTS top_lists_lookup ON top_lists (hours, metric, list_kind, rank);")

        # 48h stats
        cur.execute("""
            CREATE TABLE IF NOT EXISTS market_stats_48h (
                item_id      TEXT NOT NULL REFERENCES market_items(id) ON DELETE CASCADE,
                ts           TIMESTAMPTZ NOT NULL,
                avg_price    NUMERIC,
                min_price    NUMERIC,
                max_price    NUMERIC,
                volume       INTEGER,
                mod_rank     INTEGER,
                subtype      TEXT,
                open_price   NUMERIC,
                closed_price NUMERIC,
                median       NUMERIC,
                moving_avg   NUMERIC,
                donch_top    NUMERIC,
                donch_bot    NUMERIC
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_stats_48h_item_ts ON market_stats_48h (item_id, ts);")
        # Einzelspalte: SELECT MAX(ts) verankert jedes Fenster und lief ohne
        # diesen Index als voller Seq Scan, zweimal je Abfrage.
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_stats_48h_ts ON market_stats_48h (ts);")
        # Kein PK auf (item_id, ts): die API liefert je Zeitpunkt mehrere Zeilen —
        # eine pro mod_rank (Mods) bzw. subtype (z.B. Fischgrößen). Beide sind für
        # die meisten Items NULL und können deshalb nicht in einen PK → Unique-Index
        # über COALESCE. Siehe migrations/004 und 005.
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS market_stats_48h_item_ts_variant_uk
            ON market_stats_48h (item_id, ts, COALESCE(mod_rank, -1), COALESCE(subtype, ''));
        """)

        # 90d stats (per day)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS market_stats_90d (
                item_id      TEXT NOT NULL REFERENCES market_items(id) ON DELETE CASCADE,
                day          DATE NOT NULL,
                avg_price    NUMERIC,
                min_price    NUMERIC,
                max_price    NUMERIC,
                volume       INTEGER,
                mod_rank     INTEGER,
                subtype      TEXT,
                open_price   NUMERIC,
                closed_price NUMERIC,
                median       NUMERIC,
                moving_avg   NUMERIC,
                donch_top    NUMERIC,
                donch_bot    NUMERIC
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_stats_90d_item_day ON market_stats_90d (item_id, day);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_market_stats_90d_day ON market_stats_90d (day);")
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS market_stats_90d_item_day_variant_uk
            ON market_stats_90d (item_id, day, COALESCE(mod_rank, -1), COALESCE(subtype, ''));
        """)

        # Warframe Public Export Plus (replaces wfstat_items)
        # unique_name is the canonical Warframe internal path, e.g. /Lotus/Weapons/…
        # name_en / name_de are pre-resolved from the dict files for fast text search.
        # game_ref on the market items table also uses this path → direct JOIN possible.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS wfpe_items (
                unique_name  TEXT PRIMARY KEY,
                export_type  TEXT NOT NULL,
                name_en      TEXT,
                name_de      TEXT,
                raw          JSONB,
                content_hash TEXT,
                updated_at   TIMESTAMPTZ DEFAULT now()
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_wfpe_export_type ON wfpe_items (export_type);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_wfpe_name_en     ON wfpe_items (name_en);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_wfpe_name_de     ON wfpe_items (name_de);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_wfpe_raw_gin     ON wfpe_items USING GIN (raw);")

        # metadata table for last update tracking
        cur.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key   TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.commit()
    logging.info("DB schema verified/created.")


def migrate_drop_wfstat(conn):
    """One-time migration: remove the old wfstat_items table if it exists."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'wfstat_items'
            );
        """)
        if cur.fetchone()[0]:
            cur.execute("DROP TABLE wfstat_items;")
            conn.commit()
            logging.info("Dropped legacy wfstat_items table.")


# -------------------------
# Warframe Public Export Plus fetchers
# -------------------------
def fetch_wfpe_file(filename: str, timeout: int = 30, max_retries: int = 4) -> list | dict | None:
    """
    Fetch a single JSON file from the warframe-public-export-plus repo.
    Retries with exponential backoff on 429 / transient errors.
    """
    url = f"{WFPE_BASE_URL}/{filename}.json"
    for attempt in range(1, max_retries + 1):
        try:
            r = plain_get(url, timeout=timeout)
            if r.status_code == 429:
                wait = 2 ** attempt  # 2, 4, 8, 16 s
                logging.warning(f"Rate-limited fetching {filename} (attempt {attempt}/{max_retries}), waiting {wait}s…")
                time.sleep(wait)
                continue
            # Log any unexpected HTTP status so we can diagnose issues
            if not r.ok:
                logging.warning(
                    f"{filename}: HTTP {r.status_code} — "
                    f"preview: {r.text[:120]!r}"
                )
                r.raise_for_status()
            data = r.json()
            # Sanity-check: warn if a file came back empty so we can spot issues fast
            if (isinstance(data, list) and len(data) == 0) or \
               (isinstance(data, dict) and len(data) == 0):
                logging.warning(f"{filename}: parsed as empty {type(data).__name__} — URL: {url}")
            return data
        except Exception as e:
            # Catch-all: covers RequestException, JSONDecodeError, etc.
            if attempt == max_retries:
                logging.error(f"Failed to fetch {filename} after {max_retries} attempts: {e}")
                # Log the raw response for diagnosis if we have one
                try:
                    logging.error(f"  Last response preview: {r.text[:200]!r}")
                except Exception:
                    pass
                return None
            wait = 2 ** attempt
            logging.warning(f"Error fetching {filename} (attempt {attempt}/{max_retries}): {e} — retrying in {wait}s")
            time.sleep(wait)
    return None


def fetch_wfpe_dicts() -> tuple[dict, dict]:
    """
    Fetch EN and DE localisation dicts.
    Returns (dict_en, dict_de) — both map loc-key → translated string.
    """
    dict_en = fetch_wfpe_file("dict.en") or {}
    dict_de = fetch_wfpe_file("dict.de") or {}
    logging.info(f"Localisation dicts loaded — EN: {len(dict_en)}, DE: {len(dict_de)}")
    return dict_en, dict_de


def resolve_name(raw_name: str | None, loc_dict: dict) -> str | None:
    """
    Warframe name fields are localisation keys like /Lotus/Language/Weapons/MK1Braton.
    Look them up in the dict; fall back to the raw value if not found.
    """
    if not raw_name:
        return None
    return loc_dict.get(raw_name, raw_name)


def fetch_all_wfpe(max_workers: int = 3) -> dict[str, list]:
    """
    Fetch all configured export files from GitHub raw.
    Uses a small worker pool (default 3) with per-request delay to avoid
    GitHub raw rate limiting. Retries are handled in fetch_wfpe_file.
    Returns {export_type: [items]} for all successfully fetched exports.
    """
    results: dict[str, list] = {}

    def _fetch(name: str):
        # Small stagger to reduce burst pressure on GitHub raw
        time.sleep(0.3)
        data = fetch_wfpe_file(name)
        if data is None:
            return name, []

        # Rare: plain JSON array (none currently in WFPE, but be safe)
        if isinstance(data, list):
            return name, [item for item in data if isinstance(item, dict)]

        if not isinstance(data, dict):
            logging.warning(f"{name}: unexpected top-level type {type(data).__name__}, skipping")
            return name, []

        # Determine format by inspecting the first value.
        first_val = next(iter(data.values()), None)

        if isinstance(first_val, dict):
            # PRIMARY FORMAT — used by almost all exports:
            # { "/Lotus/Weapons/...": { <item fields> }, ... }
            # The dict KEY is the uniqueName. Inject it into each item.
            items = []
            for unique_name, item in data.items():
                if not isinstance(item, dict):
                    continue
                item["uniqueName"] = unique_name
                items.append(item)
            return name, items

        # REWARD FORMAT — ExportRewards:
        # { "/Lotus/.../TableName": [ [rewardDict, ...], ... ], ... }
        # No canonical uniqueName per reward; use "tableKey::idx" as surrogate.
        combined = []
        def _extract_rewards(obj, table_key, idx_parts):
            if isinstance(obj, dict):
                obj.setdefault("uniqueName", "{}::{}".format(table_key, ".".join(str(i) for i in idx_parts)))
                obj.setdefault("_rewardTable", table_key)
                combined.append(obj)
            elif isinstance(obj, list):
                for i, child in enumerate(obj):
                    _extract_rewards(child, table_key, idx_parts + [i])
        for table_key, table_val in data.items():
            _extract_rewards(table_val, table_key, [])
        return name, combined

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_fetch, name): name for name in WFPE_EXPORTS}
        for fut in as_completed(futures):
            name, items = fut.result()
            logging.info(f"  {name}: {len(items)} entries")
            results[name] = items

    total = sum(len(v) for v in results.values())
    logging.info(f"Fetched {total} total WFPE entries across {len(results)} exports.")
    return results


# -------------------------
# Upsert WFPE items
# -------------------------
def upsert_wfpe_items(
    conn,
    all_exports: dict[str, list],
    dict_en: dict,
    dict_de: dict,
) -> tuple[int, int, int, int]:
    """
    Smart upsert for wfpe_items:
    - Resolves name_en / name_de from localisation dicts.
    - Applies per-export field allowlist before storing.
    - Skips unchanged entries (content_hash comparison).
    - Removes entries that disappeared from the export.
    Returns (inserted, updated, deleted, skipped).
    """
    now = datetime.now(timezone.utc).isoformat()

    # Build incoming map: unique_name → row data
    incoming: dict[str, dict] = {}
    for export_type, items in all_exports.items():
        for item in items:
            unique_name = item.get("uniqueName")
            if not unique_name:
                continue
            pruned = apply_field_allowlist(item, export_type)
            h = json_hash(pruned)
            raw_name = item.get("name")
            incoming[unique_name] = {
                "export_type":  export_type,
                "name_en":      resolve_name(raw_name, dict_en),
                "name_de":      resolve_name(raw_name, dict_de),
                "raw":          pruned,
                "hash":         h,
            }

    # Load existing hashes in one shot
    with conn.cursor() as cur:
        cur.execute("SELECT unique_name, content_hash FROM wfpe_items;")
        existing: dict[str, str] = {row[0]: row[1] for row in cur.fetchall()}

    incoming_keys = set(incoming.keys())
    existing_keys = set(existing.keys())

    to_insert  = incoming_keys - existing_keys
    to_check   = incoming_keys & existing_keys
    to_delete  = existing_keys - incoming_keys
    to_update  = {k for k in to_check if incoming[k]["hash"] != existing[k]}
    skipped    = len(to_check) - len(to_update)

    upsert_rows = []
    for k in to_insert | to_update:
        d = incoming[k]
        upsert_rows.append((
            k,
            d["export_type"],
            d["name_en"],
            d["name_de"],
            Json(d["raw"]),
            d["hash"],
            now,
        ))

    deleted_count = 0
    with conn.cursor() as cur:
        if upsert_rows:
            execute_values(cur, """
                INSERT INTO wfpe_items
                    (unique_name, export_type, name_en, name_de, raw, content_hash, updated_at)
                VALUES %s
                ON CONFLICT (unique_name) DO UPDATE SET
                    export_type  = EXCLUDED.export_type,
                    name_en      = EXCLUDED.name_en,
                    name_de      = EXCLUDED.name_de,
                    raw          = EXCLUDED.raw,
                    content_hash = EXCLUDED.content_hash,
                    updated_at   = EXCLUDED.updated_at
            """, upsert_rows, page_size=200)

        if to_delete:
            cur.execute(
                "DELETE FROM wfpe_items WHERE unique_name = ANY(%s);",
                (list(to_delete),)
            )
            deleted_count = cur.rowcount

        conn.commit()

    inserted = len(to_insert)
    updated  = len(to_update)
    logging.info(
        f"wfpe_items: inserted={inserted}, updated={updated}, "
        f"deleted={deleted_count}, skipped(unchanged)={skipped}"
    )
    return inserted, updated, deleted_count, skipped


# -------------------------
# Market / warframe.market fetchers (unchanged)
# -------------------------
def fetch_market_items():
    """
    Fetch items from Warframe.Market v2 and return a list of item objects.
    Accept multiple response shapes:
      - {'payload': {'items': [...]}}
      - {'data': [...]}
      - [...]
    """
    try:
        logging.info(f"Fetching items from {MARKET_API_URL}")
        # Language: de → die Antwort enthält i18n.en UND i18n.de. Ohne den Header
        # liefert die v2-API nur Englisch, und die Oberfläche könnte Item-Namen
        # nicht umschalten. Ein Request für den ganzen Katalog, keine zweite
        # Quelle: 3677 der 3837 Namen sind echt übersetzt, inklusive Relics
        # („Requiem-Relikt: IV") und Sets („Frost Prime: Set").
        r = market_get(MARKET_API_URL, timeout=30,
                       headers={"accept": "application/json", "Language": "de"})
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict):
            if 'payload' in data and isinstance(data['payload'], dict) and 'items' in data['payload']:
                items = data['payload']['items']
            elif 'data' in data and isinstance(data['data'], list):
                items = data['data']
            elif 'items' in data and isinstance(data['items'], list):
                items = data['items']
            else:
                found = None
                for v in data.values():
                    if isinstance(v, list):
                        found = v
                        break
                items = found or []
        elif isinstance(data, list):
            items = data
        else:
            items = []
        logging.info(f"Fetched {len(items)} market items")
        return items
    except Exception as e:
        logging.error(f"Failed to fetch market items: {e}")
        return []


def upsert_items(conn, items):
    """Bulk upsert market items."""
    if not items:
        logging.info("No items to upsert.")
        return 0

    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for it in items:
        slug = it.get('slug') or it.get('url_name') or None
        if slug and any(slug.endswith(p) for p in MARKET_ITEMS_EXCLUDE_PATTERNS):
            logging.debug(f"Skipping excluded item: {slug}")
            continue
        item_id  = it.get('id') or it.get('_id') or it.get('uniqueName') or None
        game_ref = it.get('gameRef') or None
        i18n     = it.get('i18n') or {}
        tags     = it.get('tags') or []
        ducats   = it.get('ducats')
        max_rank = it.get('maxRank') if it.get('maxRank') is not None else it.get('max_rank')
        if not item_id:
            logging.debug(f"Skipping item without id: {slug or str(it)[:80]}")
            continue
        rows.append((
            item_id, slug, game_ref,
            Json(i18n), Json(tags),
            ducats, max_rank, Json(it), now
        ))

    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO market_items (id, slug, game_ref, i18n, tags, ducats, max_rank, raw, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                slug     = EXCLUDED.slug,
                game_ref = EXCLUDED.game_ref,
                i18n     = EXCLUDED.i18n,
                tags     = EXCLUDED.tags,
                ducats   = EXCLUDED.ducats,
                max_rank = EXCLUDED.max_rank,
                raw      = EXCLUDED.raw
        """, rows, page_size=100)
        conn.commit()
    logging.info(f"Upserted {len(rows)} items into market_items table.")
    return len(rows)


# -------------------------
# Statistics fetch & store (unchanged)
# -------------------------
def fetch_single_statistics(slug, max_retries=3, delay=2):
    """
    Fetch statistics for a given slug. Returns (slug, stats_48h_list, stats_90d_list)

    Zur v2-URL wird nur bei 404 auf v1 gewechselt, also wenn der Endpunkt dort
    wirklich nicht existiert. Früher lief jeder Slug nach drei erschöpften
    Versuchen komplett neu auf v2 — sechs Anfragen pro Item, bei einer Störung
    rund 22.800 statt 3.800. Gegen ein überlastetes Backend hilft dieselbe
    Anfrage unter anderer Versionsnummer ohnehin nicht.

    Gedrosselt wird zentral in wfm_http.market_get; das frühere time.sleep(0.5)
    an dieser Stelle wirkte pro Thread und ließ sich durch --workers teilen.
    """
    candidates = [
        f"https://api.warframe.market/v1/items/{slug}/statistics",
        f"https://api.warframe.market/v2/items/{slug}/statistics",
    ]
    for url in candidates:
        saw_404 = False
        for attempt in range(1, max_retries + 1):
            try:
                r = market_get(url, headers={"accept": "application/json"}, timeout=30)
                if r.status_code == 429:
                    # market_get hat den gesamten Pool bereits gebremst.
                    logging.warning(f"429 for {url} (attempt {attempt}/{max_retries})")
                    if attempt == max_retries:
                        return None
                    continue
                if r.status_code == 404:
                    saw_404 = True
                    break
                r.raise_for_status()
                payload = r.json().get("payload") or r.json().get("data") or r.json()
                stats_closed = None
                if isinstance(payload, dict):
                    stats_closed = (
                        payload.get("statistics_closed")
                        or payload.get("statistics")
                        or payload.get("statisticsClosed")
                    )
                if not stats_closed and isinstance(payload, dict):
                    stats_closed = payload
                if stats_closed:
                    stats_48 = stats_closed.get("48hours") or stats_closed.get("48_hours") or []
                    stats_90 = stats_closed.get("90days") or stats_closed.get("90_days") or []
                    return slug, stats_48 or [], stats_90 or []
                return None
            except Exception as e:
                logging.warning(f"Error fetching stats for {slug} on {url} (attempt {attempt}): {e}")
                if attempt == max_retries:
                    logging.warning(f"Giving up on {slug} for {url}")
                    return None
                time.sleep(delay)
        if not saw_404:
            # Kein 404 → der Endpunkt existiert, die Anfrage ist anders
            # gescheitert. Dann bringt die andere Version nichts.
            return None
    return None


# Indikator-Felder, die die API mitliefert (siehe migrations/003_stats_indicators.sql).
# open/closed speisen die Candlesticks, donch_top/bot den Donchian-Kanal.
INDICATOR_FIELDS = ('open_price', 'closed_price', 'median', 'moving_avg', 'donch_top', 'donch_bot')


def _indicator_values(entry: dict) -> tuple:
    return tuple(entry.get(f) for f in INDICATOR_FIELDS)


# ON CONFLICT DO UPDATE statt DO NOTHING: die Indikator-Spalten kamen erst
# nachträglich dazu, Bestandszeilen sind leer. Mit DO NOTHING würden sie beim
# Insert übersprungen und blieben für immer NULL. Da die API bei jedem Abruf
# das volle 90-Tage-Fenster liefert, füllt sich die Historie so von selbst.
_UPSERT_TAIL = """
    ON CONFLICT ({conflict}) DO UPDATE SET
        avg_price    = EXCLUDED.avg_price,
        min_price    = EXCLUDED.min_price,
        max_price    = EXCLUDED.max_price,
        volume       = EXCLUDED.volume,
        open_price   = EXCLUDED.open_price,
        closed_price = EXCLUDED.closed_price,
        median       = EXCLUDED.median,
        moving_avg   = EXCLUDED.moving_avg,
        donch_top    = EXCLUDED.donch_top,
        donch_bot    = EXCLUDED.donch_bot
"""


def _dedupe(rows: list, key_len: int) -> list:
    """
    Letzten Eintrag je Schlüssel behalten.

    ON CONFLICT DO UPDATE bricht ab, wenn ein einzelnes INSERT dieselbe Zielzeile
    zweimal trifft ("command cannot affect row a second time"). Die API liefert
    das gelegentlich — deshalb hier absichern, statt auf Wohlverhalten zu hoffen.
    """
    seen = {}
    for r in rows:
        seen[r[:key_len]] = r
    return list(seen.values())


def store_48h_stats(conn, item_id, stats_48h):
    if not stats_48h:
        return 0, 0
    rows = []
    for entry in stats_48h:
        ts = entry.get('datetime') or entry.get('ts') or entry.get('timestamp')
        if not ts:
            continue
        rows.append((
            item_id, ts, entry.get('mod_rank'), entry.get('subtype'),
            entry.get('avg_price'), entry.get('min_price'),
            entry.get('max_price'), entry.get('volume'),
        ) + _indicator_values(entry))
    rows = _dedupe(rows, 4)   # (item_id, ts, mod_rank, subtype)
    if not rows:
        return 0, 0
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO market_stats_48h
                (item_id, ts, mod_rank, subtype, avg_price, min_price, max_price, volume,
                 open_price, closed_price, median, moving_avg, donch_top, donch_bot)
            VALUES %s
        """ + _UPSERT_TAIL.format(
            conflict="item_id, ts, COALESCE(mod_rank, -1), COALESCE(subtype, '')"
        ), rows, page_size=100)
        conn.commit()
    return len(rows), 0


def store_90d_stats(conn, item_id, stats_90d):
    if not stats_90d:
        return 0, 0
    rows = []
    for entry in stats_90d:
        day = entry.get('datetime') or entry.get('date') or entry.get('day')
        if not day:
            continue
        rows.append((
            item_id,
            day.split("T")[0] if "T" in str(day) else day,
            entry.get('mod_rank'), entry.get('subtype'),
            entry.get('avg_price'), entry.get('min_price'),
            entry.get('max_price'), entry.get('volume'),
        ) + _indicator_values(entry))
    rows = _dedupe(rows, 4)   # (item_id, day, mod_rank, subtype)
    if not rows:
        return 0, 0
    with conn.cursor() as cur:
        execute_values(cur, """
            INSERT INTO market_stats_90d
                (item_id, day, mod_rank, subtype, avg_price, min_price, max_price, volume,
                 open_price, closed_price, median, moving_avg, donch_top, donch_bot)
            VALUES %s
        """ + _UPSERT_TAIL.format(
            conflict="item_id, day, COALESCE(mod_rank, -1), COALESCE(subtype, '')"
        ), rows, page_size=100)
        conn.commit()
    return len(rows), 0


def fetch_statistics_and_store(conn, max_workers=6, only_slugs=None):
    with conn.cursor() as cur:
        if only_slugs:
            cur.execute("SELECT id, slug FROM market_items WHERE slug = ANY(%s);", (list(only_slugs),))
        else:
            cur.execute("SELECT id, slug FROM market_items WHERE slug IS NOT NULL;")
        items = cur.fetchall()
    if only_slugs and not items:
        logging.warning(f"No market items matched --slug {list(only_slugs)}")
    logging.info(f"Fetching statistics for {len(items)} items (in parallel).")

    available = inserted_48 = inserted_90 = 0
    skipped = failed = 0

    batch_size = max_workers * 2
    for i in range(0, len(items), batch_size):
        batch = items[i:i+batch_size]
        slugs_map = {row[1]: row[0] for row in batch if row[1]}
        slugs = list(slugs_map.keys())

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(fetch_single_statistics, s): s for s in slugs}
            for fut in as_completed(futures):
                slug = futures[fut]
                try:
                    result = fut.result()
                except Exception as e:
                    logging.warning(f"Statistics worker failed for {slug}: {e}")
                    failed += 1
                    continue
                if not result:
                    skipped += 1
                    continue
                _, stats_48, stats_90 = result
                item_id = slugs_map.get(slug)
                if not item_id:
                    skipped += 1
                    continue
                available += 1
                try:
                    added48, _ = store_48h_stats(conn, item_id, stats_48)
                    added90, _ = store_90d_stats(conn, item_id, stats_90)
                    inserted_48 += added48
                    inserted_90 += added90
                except Exception as e:
                    logging.warning(f"Failed storing stats for {slug} ({item_id}): {e}")
                    conn.rollback()
                    failed += 1
        time.sleep(1)
    logging.info(
        f"Stats fetch complete: available={available}, 48h_inserted={inserted_48}, "
        f"90d_inserted={inserted_90}, skipped={skipped}, failed={failed}"
    )


# -------------------------
# Housekeeping (unchanged)
# -------------------------
def delete_old_48h_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM market_stats_48h WHERE ts < NOW() - INTERVAL '48 hours';")
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Failed deleting old 48h entries: {e}")
        return 0


def delete_old_90d_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM market_stats_90d WHERE day < CURRENT_DATE - INTERVAL '90 days';")
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Failed deleting old 90d entries: {e}")
        return 0


def refresh_price_reference(conn):
    """
    Median-Preis je Item neu berechnen (siehe migrations/007_price_reference.sql).

    Dient als Maßstab für die Ausreißererkennung: warframe.market-Daten sind
    Nutzerangaben, einzelne Einträge liegen um das Zehntausendfache daneben.
    Vorberechnet, weil der Median inline 154 ms kostet und pro /api/top-Aufruf
    viermal gebraucht würde.
    """
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE market_items i
            SET price_median = m.med
            FROM (
                SELECT item_id, percentile_disc(0.5) WITHIN GROUP (ORDER BY avg_price) AS med
                FROM market_stats_90d
                GROUP BY item_id
            ) m
            WHERE m.item_id = i.id
              AND i.price_median IS DISTINCT FROM m.med
        """)
        updated = cur.rowcount
        conn.commit()
    logging.info(f"price_median aktualisiert: {updated} Items")
    return updated


def refresh_sell_offers(conn, workers: int = 6):
    """
    Niedrigstes Verkaufsangebot für Items OHNE frische Handelsdaten.

    Rund 1190 von 3825 Items haben keine Handelsdaten der letzten 48 Stunden und
    zeigten deshalb überall „—", obwohl Angebote existieren — für „Warm Coat"
    sind es 107. Etwa zwei Drittel davon liefern tatsächlich ein Angebot; der
    Rest hat schlicht keinen Verkäufer.

    Geholt wird /v2/orders/item/{slug}/top: fünf beste Kauf- und Verkaufsangebote,
    bereits auf online/ingame gefiltert, EIN Request statt 107 Orders zu parsen.
    Läuft über market_get, teilt sich also das 3/s-Budget mit allem anderen.

    Nur für Items ohne 48h-Zeile: für alle 3825 wären es +22 min Sync statt +7,
    und wo ein Handelspreis existiert, ist er die bessere Angabe.

    Der Rang wird mitgespeichert, weil /top die Ränge MISCHT: bei warm_coat
    stehen Rang 0 für 1 ₱ und Rang 3 für 7 ₱ in derselben Liste. Ohne die Angabe
    wäre die Zahl irreführend.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT i.id, i.slug
            FROM market_items i
            WHERE i.slug IS NOT NULL
              -- Zeitfilter wie in der Anzeige. Ohne ihn fielen Items mit alten,
              -- aber vorhandenen Statistikzeilen durch beide Raster: kein
              -- Handelspreis (die Anzeige filtert auf 48h) und keine
              -- Angebotsabfrage (die Auswahl filterte gar nicht).
              AND NOT EXISTS (
                  SELECT 1 FROM market_stats_48h s
                  WHERE s.item_id = i.id AND s.ts >= NOW() - INTERVAL '48 hours'
              )
        """)
        targets = cur.fetchall()

    logging.info(f"Angebotspreise: {len(targets)} Items ohne 48h-Daten")
    if not targets:
        return 0

    def fetch(row):
        item_id, slug = row
        try:
            r = market_get(f"https://api.warframe.market/v2/orders/item/{slug}/top",
                           timeout=20, headers={"accept": "application/json"})
            if r.status_code != 200:
                return None
            sells = (r.json().get("data") or {}).get("sell") or []
            if not sells:
                return None
            best = min(sells, key=lambda o: o.get("platinum", 10**9))
            return (item_id, best.get("platinum"), best.get("rank"),
                    (best.get("user") or {}).get("status"))
        except Exception as e:
            logging.debug(f"Angebote für {slug} fehlgeschlagen: {e}")
            return None

    results = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(fetch, targets):
            if res:
                results.append(res)

    if results:
        with conn.cursor() as cur:
            execute_values(cur, """
                UPDATE market_items i SET
                    sell_price_min    = v.price,
                    sell_price_rank   = v.rank,
                    sell_price_status = v.status,
                    sell_orders_at    = now()
                FROM (VALUES %s) AS v(id, price, rank, status)
                WHERE i.id = v.id
            """, results)
            conn.commit()

    logging.info(f"Angebotspreise gespeichert: {len(results)} von {len(targets)}")
    return len(results)


def update_last_updated_timestamp(conn):
    with conn.cursor() as cur:
        now = datetime.now(timezone.utc).isoformat()
        cur.execute("""
            INSERT INTO metadata (key, value) VALUES ('last_updated', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """, (now,))
        conn.commit()
    logging.info(f"last_updated set to {now}")


def apply_game_ref_overrides(conn):
    overrides_path = BASE_DIR / "game_ref_overrides.json"
    if not overrides_path.exists():
        return
    with open(overrides_path) as f:
        overrides = json.load(f)
    
    rows = [(v, k) for k, v in overrides.items() if v is not None]
    if not rows:
        return
    
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, """
            UPDATE market_items SET game_ref = %s WHERE slug = %s
        """, rows)
    conn.commit()
    logging.info(f"game_ref overrides applied: {len(rows)} items")


# -------------------------
# CLI / main
# -------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Voidwatch market sync (v2 normalized schema)")
    p.add_argument("--dry-run",       action="store_true", help="fetch items but don't fetch/store statistics")
    p.add_argument("--skip-wfpe",     action="store_true", help="skip warframe public export plus sync")
    p.add_argument("--skip-market",   action="store_true", help="skip warframe.market item sync")
    p.add_argument("--workers",       type=int, default=6,  help="parallel workers for stats fetching")
    p.add_argument("--wfpe-workers",  type=int, default=3,  help="parallel workers for WFPE file fetching (keep low to avoid GitHub rate limits)")
    p.add_argument("--slug",          action="append",      help="only sync statistics for these slugs (repeatable) — for testing; a full run takes ~15 min")
    return p.parse_args()


def main(dry_run=False, workers=6, wfpe_workers=8, skip_wfpe=False, skip_market=False, slugs=None):
    start = time.time()
    logging.info("=== VOIDWATCH SYNC START ===")

    # --- Fetch phase (before touching DB) ---
    market_items = []
    if not skip_market:
        market_items = fetch_market_items()
        if not market_items:
            logging.error("No market items fetched; aborting.")
            return

    all_exports: dict[str, list] = {}
    dict_en: dict = {}
    dict_de: dict = {}
    if not skip_wfpe:
        logging.info("Fetching localisation dicts…")
        dict_en, dict_de = fetch_wfpe_dicts()
        logging.info("Fetching all Public Export Plus files…")
        all_exports = fetch_all_wfpe(max_workers=wfpe_workers)

    # --- DB phase ---
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        create_schema(conn)
        migrate_drop_wfstat(conn)

        if not skip_market and market_items:
            upsert_items(conn, market_items)
            apply_game_ref_overrides(conn)

        if not skip_wfpe and all_exports:
            upsert_wfpe_items(conn, all_exports, dict_en, dict_de)
        elif not skip_wfpe:
            logging.warning("Skipping WFPE upsert: no data fetched.")

        if not dry_run and not skip_market:
            fetch_statistics_and_store(conn, max_workers=workers, only_slugs=slugs)
        else:
            logging.info("Skipping stats fetch/store (dry-run or skip-market).")

        # Referenzpreise immer aktualisieren — sie hängen an den gerade
        # geschriebenen Statistiken, nicht am Housekeeping.
        if not dry_run and not skip_market:
            try:
                refresh_price_reference(conn)
            except Exception as e:
                logging.error(f"refresh_price_reference fehlgeschlagen: {e}")

        # Angebotspreise nur im Volllauf: bei --slug fehlt der Gesamtüberblick,
        # welche Items ohne Handelsdaten dastehen.
        if not dry_run and not skip_market and not slugs:
            try:
                refresh_sell_offers(conn)
            except Exception as e:
                logging.error(f"refresh_sell_offers fehlgeschlagen: {e}", exc_info=True)

        if slugs:
            logging.info("--slug gesetzt: Housekeeping und Nachlauf-Skripte übersprungen.")
        else:
            deleted48 = delete_old_48h_entries(conn)
            deleted90 = delete_old_90d_entries(conn)
            logging.info(f"Deleted old entries: {deleted48} from market_stats_48h, {deleted90} from market_stats_90d")
        if not skip_wfpe and not dry_run and not slugs:
            try:
                import precompute_drops
                logging.info("Starte precompute_drops...")
                precompute_drops.run(conn)
            except Exception as e:
                logging.error(f"precompute_drops fehlgeschlagen: {e}", exc_info=True)
        if not dry_run and not slugs:
            try:
                import sync_images
                logging.info("Starte sync_images...")
                sync_images.run(conn=conn)
            except Exception as e:
                logging.error(f"sync_images fehlgeschlagen: {e}", exc_info=True)

        # Bei --slug lief kein vollständiger Sync — der Zeitstempel im Footer
        # würde sonst eine Aktualität vortäuschen, die es nicht gibt.
        if not slugs:
            try:
                update_last_updated_timestamp(conn)
            except Exception as e:
                logging.error(f"Failed to update metadata timestamp: {e}")

            # NACH dem Zeitstempel: precompute_tops prägt source_updated aus
            # metadata.last_updated. Liefe es davor, trüge die Vorberechnung den
            # alten Stand und die API verwürfe sie sofort als veraltet.
            #
            # Ein Fehlschlag ist nicht fatal: die API rechnet dann live weiter,
            # langsam aber richtig.
            if not dry_run:
                try:
                    import precompute_tops
                    logging.info("Starte precompute_tops...")
                    precompute_tops.run(conn)
                except Exception as e:
                    logging.error(f"precompute_tops fehlgeschlagen: {e}", exc_info=True)
    except Exception as e:
        logging.exception(f"Fatal error in main sync: {e}")
    finally:
        conn.close()

    elapsed = time.time() - start
    logging.info(f"=== VOIDWATCH SYNC END ({elapsed:.2f}s) ===")


if __name__ == "__main__":
    args = parse_args()
    main(
        dry_run=args.dry_run,
        workers=args.workers,
        wfpe_workers=args.wfpe_workers,
        skip_wfpe=args.skip_wfpe,
        skip_market=args.skip_market,
        slugs=args.slug,
    )