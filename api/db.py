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
    if not row:
        return None
    return row[0]["value"]

def get_top_performers(hours, limit):
    return query(f"""
        SELECT i.item_name, MAX(s.datetime) AS datetime,
               AVG(s.avg_price) AS avg_price, MIN(s.min_price) AS min_price,
               MAX(s.max_price) AS max_price, SUM(s.volume) AS volume
        FROM item_stats_48h s
        JOIN items i ON i.url_name = s.url_name
        WHERE datetime >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY avg_price DESC
        LIMIT %s
    """, (limit,))

def get_top_sellers(hours, limit):
    return query(f"""
        SELECT i.item_name, MAX(s.datetime) AS datetime,
               AVG(s.avg_price) AS avg_price, MIN(s.min_price) AS min_price,
               MAX(s.max_price) AS max_price, SUM(s.volume) AS volume
        FROM item_stats_48h s
        JOIN items i ON i.url_name = s.url_name
        WHERE datetime >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY volume DESC
        LIMIT %s
    """, (limit,))

def get_most_traded(hours, limit):
    return query(f"""
        SELECT i.item_name, MAX(s.datetime) AS datetime,
               AVG(s.avg_price) AS avg_price, MIN(s.min_price) AS min_price,
               MAX(s.max_price) AS max_price, SUM(s.volume) AS volume
        FROM item_stats_48h s
        JOIN items i ON i.url_name = s.url_name
        WHERE datetime >= NOW() - INTERVAL '{hours} hour'
        GROUP BY item_name
        ORDER BY volume DESC
        LIMIT %s
    """, (limit,))
