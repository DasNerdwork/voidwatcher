import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

def get_conn():
    return psycopg2.connect(
        host=os.getenv("VW_HOST"),
        port=os.getenv("VW_PORT"),
        user=os.getenv("VW_USER"),
        password=os.getenv("VW_PASSWORD"),
        dbname=os.getenv("VW_NAME"),
    )

def query(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    finally:
        conn.close()

def get_last_updated():
    row = query("SELECT value FROM metadata WHERE key = 'last_updated'")
    return row[0]["value"] if row else None

# ---- UPDATED QUERIES ---- #

def get_top_performers(hours, limit):
    return query(f"""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS item_name,
            MAX(s.ts) AS datetime,
            AVG(s.avg_price) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume
        FROM market_stats_48h s
        JOIN market_items i ON i.id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY avg_price DESC
        LIMIT %s;
    """, (limit,))

def get_top_sellers(hours, limit):
    return query(f"""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS item_name,
            MAX(s.ts) AS datetime,
            AVG(s.avg_price) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume
        FROM market_stats_48h s
        JOIN market_items i ON i.id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY volume DESC
        LIMIT %s;
    """, (limit,))

def get_most_traded(hours, limit):
    return query(f"""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS item_name,
            MAX(s.ts) AS datetime,
            AVG(s.avg_price) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume
        FROM market_stats_48h s
        JOIN market_items i ON i.id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY volume DESC
        LIMIT %s;
    """, (limit,))
