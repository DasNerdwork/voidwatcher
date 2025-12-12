#!/usr/bin/env python3
import os
import time
import json
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import psycopg2
from psycopg2.extras import execute_values, Json
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv

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
# load .env from ../api/.env (keep your existing layout)
load_dotenv(BASE_DIR / "../api/.env")

DB_CONFIG = {
    'dbname': os.getenv('VW_NAME'),
    'user': os.getenv('VW_USER'),
    'password': os.getenv('VW_PASSWORD'),
    'host': os.getenv('VW_HOST', 'localhost'),
    'port': int(os.getenv('VW_PORT', 5432))
}

MARKET_API_URL = "https://api.warframe.market/v2/items"
WFSTAT_API_URL = "https://api.warframestat.us/items"
FIELD_BLACKLIST = {'abcABC', '123456'}

# -------------------------
# Database schema creation
# -------------------------
def create_schema(conn):
    with conn.cursor() as cur:
        # items - normalized with JSONB raw copy
        cur.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                slug TEXT UNIQUE,
                game_ref TEXT,
                i18n JSONB,
                tags JSONB,
                ducats INT,
                max_rank INT,
                raw JSONB,
                created_at TIMESTAMPTZ DEFAULT now()
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_slug ON items (slug);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_tags ON items USING GIN (tags);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_items_i18n_en_name ON items ((raw->'i18n'->'en'->>'name'));")

        # 48h stats
        cur.execute("""
            CREATE TABLE IF NOT EXISTS item_stats_48h (
                item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                ts TIMESTAMPTZ NOT NULL,
                avg_price NUMERIC,
                min_price NUMERIC,
                max_price NUMERIC,
                volume INTEGER,
                PRIMARY KEY (item_id, ts)
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_48h_item_ts ON item_stats_48h (item_id, ts);")

        # 90d stats (per day)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS item_stats_90d (
                item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                day DATE NOT NULL,
                avg_price NUMERIC,
                min_price NUMERIC,
                max_price NUMERIC,
                volume INTEGER,
                PRIMARY KEY (item_id, day)
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_90d_item_day ON item_stats_90d (item_id, day);")

        # metadata table for last update
        cur.execute("""
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        """)
        conn.commit()
    logging.info("DB schema verified/created.")

# -------------------------
# Market / Warframestat fetchers
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
        r = requests.get(MARKET_API_URL, timeout=30)
        r.raise_for_status()
        data = r.json()
        # try common shapes
        if isinstance(data, dict):
            if 'payload' in data and isinstance(data['payload'], dict) and 'items' in data['payload']:
                items = data['payload']['items']
            elif 'data' in data and isinstance(data['data'], list):
                items = data['data']
            elif 'items' in data and isinstance(data['items'], list):
                items = data['items']
            else:
                # fallback: look for a top-level array inside dict values
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

def fetch_all_wfstat_items():
    try:
        logging.info(f"Fetching tradable items from {WFSTAT_API_URL}")
        r = requests.get(WFSTAT_API_URL, timeout=30)
        r.raise_for_status()
        items = r.json()
        logging.info(f"Fetched {len(items)} items from warframestat")
        return items
    except Exception as e:
        logging.error(f"Failed to fetch warframestat items: {e}")
        return []

# -------------------------
# Insert / Upsert items
# -------------------------
def upsert_items(conn, items):
    """
    Bulk upsert items into items table.
    Expect items from market v2 shape.
    """
    if not items:
        logging.info("No items to upsert.")
        return 0

    rows = []
    now = datetime.now(timezone.utc).isoformat()
    for it in items:
        item_id = it.get('id') or it.get('_id') or it.get('uniqueName') or None
        slug = it.get('slug') or it.get('url_name') or None
        game_ref = it.get('gameRef') or None
        i18n = it.get('i18n') or {}
        tags = it.get('tags') or []
        ducats = it.get('ducats')
        max_rank = it.get('maxRank') if it.get('maxRank') is not None else it.get('max_rank')
        raw = it
        if not item_id:
            # skip objects without a stable id
            logging.debug(f"Skipping item without id: {slug or str(it)[:80]}")
            continue
        rows.append((
            item_id,
            slug,
            game_ref,
            Json(i18n),
            Json(tags),
            ducats,
            max_rank,
            Json(raw),
            now
        ))

    with conn.cursor() as cur:
        sql_template = """
            INSERT INTO items (id, slug, game_ref, i18n, tags, ducats, max_rank, raw, created_at)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                slug = EXCLUDED.slug,
                game_ref = EXCLUDED.game_ref,
                i18n = EXCLUDED.i18n,
                tags = EXCLUDED.tags,
                ducats = EXCLUDED.ducats,
                max_rank = EXCLUDED.max_rank,
                raw = EXCLUDED.raw
        """
        execute_values(cur, sql_template, rows, page_size=100)
        conn.commit()
    logging.info(f"Upserted {len(rows)} items into items table.")
    return len(rows)

# -------------------------
# Statistics fetch & store
# -------------------------
def fetch_single_statistics(slug, max_retries=3, delay=2):
    """
    Fetch statistics for a given slug. Returns (slug, stats_48h_list, stats_90d_list)
    """
    # attempt known stats endpoint paths; prefer slug
    candidates = [
        f"https://api.warframe.market/v1/items/{slug}/statistics",
        f"https://api.warframe.market/v2/items/{slug}/statistics",
    ]
    for url in candidates:
        for attempt in range(1, max_retries + 1):
            try:
                time.sleep(0.5) # small delay to avoid rate limits
                r = requests.get(url, headers={"accept": "application/json"}, timeout=30)
                if r.status_code == 429:
                    logging.warning(f"429 for {url} (attempt {attempt}/{max_retries})")
                    if attempt == max_retries:
                        return None
                    time.sleep(delay)
                    continue
                r.raise_for_status()
                payload = r.json().get("payload") or r.json().get("data") or r.json()
                # normalize to get statistics_closed if present, else try direct keys
                stats_closed = None
                if isinstance(payload, dict):
                    stats_closed = payload.get("statistics_closed") or payload.get("statistics") or payload.get("statisticsClosed")
                if not stats_closed and isinstance(payload, dict):
                    # Sometimes API returns dict of windows
                    stats_closed = payload
                if stats_closed:
                    stats_48 = stats_closed.get("48hours") or stats_closed.get("48hours", []) or stats_closed.get("48_hours") or []
                    stats_90 = stats_closed.get("90days") or stats_closed.get("90days", []) or stats_closed.get("90_days") or []
                    return slug, stats_48 or [], stats_90 or []
                return None
            except Exception as e:
                logging.warning(f"Error fetching stats for {slug} on {url} (attempt {attempt}): {e}")
                if attempt == max_retries:
                    logging.warning(f"Giving up on {slug} for {url}")
                    break
                time.sleep(delay)
    return None

def store_48h_stats(conn, item_id, stats_48h):
    if not stats_48h:
        return 0, 0
    rows = []
    inserted = 0
    skipped = 0
    for entry in stats_48h:
        ts = entry.get('datetime') or entry.get('ts') or entry.get('timestamp')
        if not ts:
            continue
        rows.append((item_id, ts, entry.get('avg_price'), entry.get('min_price'), entry.get('max_price'), entry.get('volume')))
    if not rows:
        return 0, 0
    with conn.cursor() as cur:
        sql = """
            INSERT INTO item_stats_48h (item_id, ts, avg_price, min_price, max_price, volume)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        execute_values(cur, sql, rows, page_size=100)
        conn.commit()
        # approximate counts: can't get rowcount easily from execute_values; get count inserted via checking DB?
        # Instead, attempt to count rows for the last inserted timeframe - but keep it simple and return len(rows)
    return len(rows), 0

def store_90d_stats(conn, item_id, stats_90d):
    if not stats_90d:
        return 0, 0
    rows = []
    for entry in stats_90d:
        day = entry.get('datetime') or entry.get('date') or entry.get('day')
        if not day:
            continue
        # normalize to DATE for storage (psycopg will accept ISO date string)
        rows.append((item_id, day.split("T")[0] if "T" in str(day) else day, entry.get('avg_price'), entry.get('min_price'), entry.get('max_price'), entry.get('volume')))
    if not rows:
        return 0, 0
    with conn.cursor() as cur:
        sql = """
            INSERT INTO item_stats_90d (item_id, day, avg_price, min_price, max_price, volume)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        execute_values(cur, sql, rows, page_size=100)
        conn.commit()
    return len(rows), 0

def fetch_statistics_and_store(conn, max_workers=6):
    with conn.cursor() as cur:
        cur.execute("SELECT id, slug FROM items WHERE slug IS NOT NULL;")
        items = cur.fetchall()
    logging.info(f"Fetching statistics for {len(items)} items (in parallel).")

    available = inserted_48 = inserted_90 = 0
    skipped = failed = 0

    # process in batches to avoid hammering the API
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
                    failed += 1
        # small delay between batches
        time.sleep(1)
    logging.info(f"Stats fetch complete: available={available}, 48h_inserted={inserted_48}, 90d_inserted={inserted_90}, skipped={skipped}, failed={failed}")

# -------------------------
# housekeeping
# -------------------------
def delete_old_48h_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM item_stats_48h WHERE ts < NOW() - INTERVAL '48 hours';")
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Failed deleting old 48h entries: {e}")
        return 0

def delete_old_90d_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM item_stats_90d WHERE day < CURRENT_DATE - INTERVAL '90 days';")
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Failed deleting old 90d entries: {e}")
        return 0

def update_last_updated_timestamp(conn):
    with conn.cursor() as cur:
        now = datetime.now(timezone.utc).isoformat()
        cur.execute("""
            INSERT INTO metadata (key, value)
            VALUES ('last_updated', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """, (now,))
        conn.commit()
    logging.info(f"last_updated set to {now}")

# -------------------------
# CLI / main
# -------------------------
def parse_args():
    p = argparse.ArgumentParser(description="Voidwatch market sync (v2 normalized schema)")
    p.add_argument("--dry-run", action="store_true", help="fetch items but don't fetch/store statistics")
    p.add_argument("--workers", type=int, default=6, help="parallel workers for stats fetching")
    return p.parse_args()

def main(dry_run=False, workers=6):
    start = time.time()
    logging.info("=== VOIDWATCH SYNC START ===")

    market_items = fetch_market_items()
    if not market_items:
        logging.error("No market items fetched; aborting.")
        return

    # Connect DB and create schema if needed
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        create_schema(conn)
        upsert_items(conn, market_items)

        if not dry_run:
            fetch_statistics_and_store(conn, max_workers=workers)
        else:
            logging.info("Dry-run: skipping stats fetch/store.")

        deleted48 = delete_old_48h_entries(conn)
        deleted90 = delete_old_90d_entries(conn)
        logging.info(f"Deleted old entries: {deleted48} from 48h, {deleted90} from 90d")
        try:
            update_last_updated_timestamp(conn)
        except Exception as e:
            logging.error(f"Failed to update metadata timestamp: {e}")
    except Exception as e:
        logging.exception(f"Fatal error in main sync: {e}")
    finally:
        conn.close()

    elapsed = time.time() - start
    logging.info(f"=== VOIDWATCH SYNC END ({elapsed:.2f}s) ===")

if __name__ == "__main__":
    args = parse_args()
    main(dry_run=args.dry_run, workers=args.workers)
