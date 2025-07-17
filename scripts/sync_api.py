#!/usr/bin/env python3
import requests
import psycopg2
from psycopg2.extras import execute_values
from psycopg2 import sql
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
from logging.handlers import RotatingFileHandler
from dotenv import load_dotenv
import os
import time
from datetime import datetime
import argparse

# --- Logging einrichten ---
log_dir = os.path.join(os.path.dirname(__file__), '..', 'log')
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, 'cron.log')

handler = RotatingFileHandler(
    log_file,
    maxBytes=50 * 1024 * 1024,
    backupCount=1
)

formatter = logging.Formatter(
    '[%(asctime)s] [%(filename)s - %(levelname)s]: %(message)s',
    datefmt='%d.%m.%Y %H:%M:%S'
)

handler.setFormatter(formatter)

logging.basicConfig(
    level=logging.INFO,
    handlers=[handler]
)

# --- Konfiguration ---
load_dotenv()
DB_CONFIG = {
    'dbname': os.getenv('VW_NAME'),
    'user': os.getenv('VW_USER'),
    'password': os.getenv('VW_PASSWORD'),
    'host': os.getenv('VW_HOST'),
    'port': int(os.getenv('VW_PORT'))
}

MARKET_API_URL = "https://api.warframe.market/v1/items"
WFSTAT_API_URL = "https://api.warframestat.us/items"
FIELD_BLACKLIST = {'abcABC', '123456'}

def fetch_all_items():
    try:
        logging.info(f"Starte Abfrage aller Items von {WFSTAT_API_URL}")
        response = requests.get(WFSTAT_API_URL)
        response.raise_for_status()
        items = response.json()
        # Kein Filter auf "tradable"
        logging.info(f"Gefundene Items insgesamt: {len(items)}")
        return items
    except Exception as e:
        logging.error(f"Fehler beim Abrufen der Items: {e}")
        return []

def get_all_fields(items):
    fields = set()
    for item in items:
        fields.update(item.keys())
    return sorted(f for f in fields if f not in FIELD_BLACKLIST)

def create_item_info_table(conn, fields):
    with conn.cursor() as cur:
        safe_fields = [f for f in fields if f.lower() != "uniquename"]
        field_defs = ",\n".join([f"{f} TEXT" for f in safe_fields])
        if field_defs:
            field_defs += ",\n"
        field_defs += "uniqueName TEXT UNIQUE"

        query = f"""
            CREATE TABLE IF NOT EXISTS item_info (
                id SERIAL PRIMARY KEY,
                {field_defs}
            );
        """
        cur.execute(query)
        conn.commit()
        logging.info(f"Tabelle 'item_info' erstellt oder existiert bereits mit {len(fields)} Feldern")

def prepare_rows(items, fields):
    rows = []
    for item in items:
        row = [str(item.get(f)) if item.get(f) is not None else None for f in fields if f.lower() != "uniquename"]
        row.append(item.get("uniqueName"))
        rows.append(row)
    return rows

def insert_item_info(conn, fields, rows):
    with conn.cursor() as cur:
        safe_fields = [f for f in fields if f.lower() != "uniquename"]
        all_columns = safe_fields + ["uniqueName"]
        update_fields = [f for f in all_columns if f not in ("uniqueName", "id")]
        update_clause = ", ".join([f"{field} = EXCLUDED.{field}" for field in update_fields])

        query = f"""
            INSERT INTO item_info ({", ".join(all_columns)})
            VALUES %s
            ON CONFLICT (uniqueName) DO UPDATE SET
            {update_clause};
        """
        execute_values(cur, query, rows)
        conn.commit()
        logging.info(f"Item-Info Tabelle mit {len(rows)} Einträgen aktualisiert")

# --- Schritt 1: API abrufen ---
def fetch_items():
    try:
        logging.info(f"Starting item sync on {MARKET_API_URL}")
        response = requests.get(MARKET_API_URL)
        response.raise_for_status()
        return response.json()['payload']['items']
    except requests.RequestException as e:
        logging.error(f"Fehler beim Abrufen der API: {e}")
        return []

# --- Schritt 2: Tabellen erstellen ---
def create_item_table_if_not_exists(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                item_name TEXT,
                url_name TEXT,
                thumb TEXT
            )
        """)
        conn.commit()

def create_48h_table_if_not_exists(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS item_stats_48h (
                id TEXT NOT NULL,
                url_name TEXT NOT NULL,
                datetime TIMESTAMPTZ NOT NULL,
                avg_price NUMERIC,
                min_price NUMERIC,
                max_price NUMERIC,
                volume INTEGER,
                PRIMARY KEY (id, datetime)
            )
        """)
        conn.commit()

def create_90d_table_if_not_exists(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS item_stats_90d (
                id TEXT NOT NULL,
                url_name TEXT NOT NULL,
                datetime DATE NOT NULL,
                avg_price NUMERIC,
                min_price NUMERIC,
                max_price NUMERIC,
                volume INTEGER,
                PRIMARY KEY (url_name, datetime)
            )
        """)
        conn.commit()

def delete_old_48h_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM item_stats_48h
                WHERE datetime < NOW() - INTERVAL '48 hours'
            """)
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Fehler beim Löschen alter Statistikeinträge: {e}")
        return 0

def delete_old_90d_entries(conn):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM item_stats_90d
                WHERE datetime < CURRENT_DATE - INTERVAL '90 days'
            """)
            deleted = cur.rowcount
            conn.commit()
            return deleted
    except Exception as e:
        logging.error(f"Fehler beim Löschen alter 90d-Einträge: {e}")
        return 0


# --- Schritt 3: Items einfügen ---
def insert_items(conn, items):
    with conn.cursor() as cur:
        for item in items:
            cur.execute("SELECT 1 FROM items WHERE id = %s", (item['id'],))
            if cur.fetchone() is None:
                cur.execute("""
                    INSERT INTO items (id, item_name, url_name, thumb)
                    VALUES (%s, %s, %s, %s)
                """, (item['id'], item['item_name'], item['url_name'], item['thumb']))
        conn.commit()

# --- Schritt 4: Einzelstatistik abrufen (nur 48h) ---
def fetch_single_statistics(url_name, max_retries=3, delay=2):
    url = f"https://api.warframe.market/v1/items/{url_name}/statistics"
    for attempt in range(1, max_retries + 1):
        try:
            res = requests.get(url, headers={"accept": "application/json"})
            if res.status_code == 429:
                logging.warning(f"429 Too Many Requests bei {url_name}, Versuch {attempt}/{max_retries}")
                if attempt == max_retries:
                    logging.warning(f"Fehlgeschlagen bei {url} nach {max_retries} Versuchen: 429 Too Many Requests für {url_name}")
                    return None
                time.sleep(delay)
                continue
            res.raise_for_status()
            payload = res.json().get("payload", {}).get("statistics_closed", {})
            if payload:
                return url_name, payload.get("48hours", []), payload.get("90days", [])
            else:
                return None
        except Exception as e:
            logging.warning(f"Fehler bei {url_name} (Versuch {attempt}/{max_retries}): {e}")
            if attempt == max_retries:
                logging.warning(f"Fehlgeschlagen bei {url} nach {max_retries} Versuchen: {e} für {url_name}")
                return None
            time.sleep(delay)

# --- Schritt 5: Statistiken speichern ---
def fetch_statistics_and_store(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT url_name FROM items WHERE url_name IS NOT NULL;")
        url_names = [row[0] for row in cur.fetchall()]

    available, inserted, skipped, failed = 0, 0, 0, 0

    for i in range(0, len(url_names), 3):
        batch = url_names[i:i+3]

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(fetch_single_statistics, name) for name in batch]

            for future in as_completed(futures):
                result = future.result()
                if result:
                    url_name, stats_48h, stats_90d = result
                    available += 1
                    with conn.cursor() as cur:
                        for entry in stats_48h:
                            try:
                                cur.execute("""
                                    INSERT INTO item_stats_48h
                                    (id, url_name, datetime, avg_price, min_price, max_price, volume)
                                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                                    ON CONFLICT DO NOTHING;
                                """, (
                                    entry.get('id'), url_name, entry.get('datetime'),
                                    entry.get('avg_price'), entry.get('min_price'),
                                    entry.get('max_price'), entry.get('volume')
                                ))
                                if cur.rowcount == 1:
                                    inserted += 1
                                else:
                                    skipped += 1
                            except Exception as e:
                                failed += 1
                                logging.warning(f"Insert-Fehler bei 48h {url_name} ({entry.get('datetime')}): {e}")
                            for entry in stats_90d:
                                try:
                                    cur.execute("""
                                        INSERT INTO item_stats_90d
                                        (id, url_name, datetime, avg_price, min_price, max_price, volume)
                                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                                        ON CONFLICT DO NOTHING;
                                    """, (
                                        entry.get('id'), url_name, entry.get('datetime'),
                                        entry.get('avg_price'), entry.get('min_price'),
                                        entry.get('max_price'), entry.get('volume')
                                    ))
                                    if cur.rowcount == 1:
                                        inserted += 1
                                    else:
                                        skipped += 1
                                except Exception as e:
                                    logging.warning(f"Insert-Fehler 90d: {e}")
                    conn.commit()
                else:
                    skipped += 1
        time.sleep(1)

    logging.info(f"✔️ API Sync abgeschlossen: verfügbar={available}, neu={inserted}, übersprungen={skipped}, fehlgeschlagen={failed}")

def update_last_updated_timestamp(conn):
    with conn.cursor() as cur:
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT INTO metadata (key, value)
            VALUES ('last_updated', %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """, (now,))
        conn.commit()
        logging.info(f"📌 last_updated gesetzt auf {now}")


def parse_args():
    parser = argparse.ArgumentParser(description="Voidwatch Datenimport-Script")
    parser.add_argument("--dry-run", action="store_true", help="Nur Statistiken holen, keine neuen Items laden")
    return parser.parse_args()

# --- Hauptlogik ---
def main(dry_run=False):
    start_time = time.time()

    # 1. NEU: Tradable Items von warframestat.us abfragen und item_info Tabelle syncen
    tradable_items = fetch_all_items()
    if tradable_items:
        conn = psycopg2.connect(**DB_CONFIG)
        try:
            fields = get_all_fields(tradable_items)
            create_item_info_table(conn, fields)
            rows = prepare_rows(tradable_items, fields)
            insert_item_info(conn, fields, rows)
        except Exception as e:
            logging.error(f"Fehler beim Syncen der item_info Tabelle: {e}")
        finally:
            conn.close()
    else:
        logging.warning("Keine tradable Items zum Syncen gefunden.")

    items = fetch_items()
    if not items:
        logging.info("Keine Items geladen. Vorgang abgebrochen.")
        return

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        create_item_table_if_not_exists(conn)
        insert_items(conn, items)
        create_48h_table_if_not_exists(conn)
        create_90d_table_if_not_exists(conn)
        if not dry_run:
            fetch_statistics_and_store(conn)
        else:
            logging.info("⚠️ Item-Sync übersprungen (Test-Modus)")
        deleted_48h = delete_old_48h_entries(conn)
        deleted_90d = delete_old_90d_entries(conn)
        logging.info(f"🧹 Insgesamt gelöscht: {deleted_48h} aus item_stats_48h und {deleted_90d} aus item_stats_90d.")
        try:
            update_last_updated_timestamp(conn)
        except Exception as e:
            logging.error(f"Fehler beim Aktualisieren des last_updated Timestamps: {e}")
    except Exception as e:
        logging.error(f"Allgemeiner Fehler im Hauptablauf: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

    duration = round(time.time() - start_time, 2)
    if duration < 60:
        logging.info(f"✅ Laufzeit: {duration:.2f} Sekunden")
    else:
        minutes = duration / 60
        logging.info(f"✅ Laufzeit: {minutes:.2f} Minuten")

    logging.info('---------------------------------------------------------------------------')

if __name__ == "__main__":
    args = parse_args()
    main(dry_run=args.dry_run)
