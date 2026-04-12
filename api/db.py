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


# ──────────────────────────────────────────────
# HILFSFUNKTIONEN
# ──────────────────────────────────────────────

def _tag_filter(tag: str | None) -> tuple[str, list]:
    if not tag:
        return "", []
    return "AND (i.raw->>'tags')::jsonb ? %s", [tag]


def _rank_clause(rank_mode: str) -> str:
    if rank_mode == "max":
        return """AND (
            i.max_rank IS NULL
            OR s.mod_rank IS NULL
            OR s.mod_rank = i.max_rank
        )"""
    if rank_mode == "unranked":
        return "AND (i.max_rank IS NULL OR s.mod_rank = 0 OR s.mod_rank IS NULL)"
    return ""


def _change_pct_cte(hours: float) -> str:
    return f"""
        latest AS (
            SELECT MAX(ts) AS max_ts FROM market_stats_48h
        ),
        current_price AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_48h, latest
            WHERE ts >= latest.max_ts - INTERVAL '6 hours'
            GROUP BY item_id
        ),
        previous_price AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_48h, latest
            WHERE ts >= latest.max_ts - INTERVAL '{hours} hours'
              AND ts  < latest.max_ts - INTERVAL '6 hours'
            GROUP BY item_id
        )
    """


def _change_pct_cte_90d(days: int) -> str:
    return f"""
        current_price AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_90d
            WHERE day = (SELECT MAX(day) FROM market_stats_90d)
            GROUP BY item_id
        ),
        previous_price AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_90d
            WHERE day = (
                SELECT MIN(day) FROM market_stats_90d
                WHERE day >= (NOW() - INTERVAL '{days} days')::date
            )
            GROUP BY item_id
        )
    """


def _top_query_90d(days: int, tag_clause: str, rank_clause: str,
                   order_by: str, tag_params: list, limit: int,
                   having: str = "HAVING SUM(s.volume) >= 2") -> list:
    # Für change_pct-Sortierung: volume-gewichteter Score als Ranking-Basis.
    # change_pct wird unverändert zurückgegeben — nur die Reihenfolge ändert sich.
    # Formel: change_pct * LN(volume + 1) → 300% bei 2 Trades < 45% bei 50 Trades
    if "change_pct" in order_by:
        direction = "DESC" if "DESC" in order_by else "ASC"
        effective_order = f"(ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) * LN(SUM(s.volume) + 1)) {direction} NULLS LAST"
    else:
        effective_order = order_by
    return query(f"""
        WITH {_change_pct_cte_90d(days)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            (SELECT MAX(day) FROM market_stats_90d)::timestamptz AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_90d s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.day >= (NOW() - INTERVAL '{{days}} days')::date
          {{tag_clause}}
          {{rank_clause}}
        GROUP BY i.id, i.thumb_path, i.image_path, c.price, p.price, i.max_rank
        {{having}}
        ORDER BY {{effective_order}}
        LIMIT %s
    """, tag_params + [limit])


# ──────────────────────────────────────────────
# TOP-LISTEN
# ──────────────────────────────────────────────

def get_top_performers(hours, limit, tag: str | None = None, rank_mode: str = "max"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            order_by="change_pct DESC NULLS LAST", tag_params=tag_params, limit=limit,
        )

    return query(f"""
        WITH {_change_pct_cte(hours)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause}
          {rank_clause}
        GROUP BY i.id, i.thumb_path, i.image_path, c.price, p.price, i.max_rank
        HAVING SUM(s.volume) >= 2
        ORDER BY (ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) * LN(SUM(s.volume) + 1)) DESC NULLS LAST
        LIMIT %s
    """, tag_params + [limit])


def get_top_sellers(hours, limit, tag: str | None = None, rank_mode: str = "max"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            order_by="AVG(s.avg_price) DESC", tag_params=tag_params, limit=limit, having="",
        )

    return query(f"""
        WITH {_change_pct_cte(hours)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause}
          {rank_clause}
        GROUP BY i.id, i.thumb_path, i.image_path, c.price, p.price, i.max_rank
        ORDER BY avg_price DESC
        LIMIT %s
    """, tag_params + [limit])


def get_most_traded(hours, limit, tag: str | None = None, rank_mode: str = "max"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            order_by="SUM(s.volume) DESC", tag_params=tag_params, limit=limit, having="",
        )

    return query(f"""
        WITH {_change_pct_cte(hours)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause}
          {rank_clause}
        GROUP BY i.id, i.thumb_path, i.image_path, c.price, p.price, i.max_rank
        ORDER BY volume DESC
        LIMIT %s
    """, tag_params + [limit])


# ──────────────────────────────────────────────
# VOLUME LEADERS
# ──────────────────────────────────────────────

def get_volume_leaders(
    hours: int = 24, limit: int = 20, tag: str | None = None,
    min_volume: int = 3, rank_mode: str = "max",
):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        days = hours // 24
        return query(f"""
            WITH {_change_pct_cte_90d(days)}
            SELECT
                (i.raw->'i18n'->'en'->>'name')       AS item_name,
                i.slug, i.tags, i.max_rank            AS max_rank,
                i.thumb_path, i.image_path,
                ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
                MIN(s.min_price)                      AS min_price,
                MAX(s.max_price)                      AS max_price,
                SUM(s.volume)                         AS volume,
                ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
            FROM market_stats_90d s
            JOIN market_items i        ON i.id = s.item_id
            JOIN current_price c       ON c.item_id = s.item_id
            LEFT JOIN previous_price p ON p.item_id = s.item_id
            WHERE s.day >= (NOW() - INTERVAL '{days} days')::date
              {tag_clause} {rank_clause}
            GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price
            HAVING SUM(s.volume) >= %s
            ORDER BY SUM(s.volume) DESC
            LIMIT %s
        """, tag_params + [min_volume, limit])

    return query(f"""
        WITH {_change_pct_cte(hours)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')       AS item_name,
            i.slug, i.tags, i.max_rank            AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
            MIN(s.min_price)                      AS min_price,
            MAX(s.max_price)                      AS max_price,
            SUM(s.volume)                         AS volume,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause} {rank_clause}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price
        HAVING SUM(s.volume) >= %s
        ORDER BY SUM(s.volume) DESC
        LIMIT %s
    """, tag_params + [min_volume, limit])


# ──────────────────────────────────────────────
# VALUE LEADERS
# ──────────────────────────────────────────────

def get_value_leaders(
    hours: int = 24, limit: int = 20, tag: str | None = None,
    min_volume: int = 3, rank_mode: str = "max",
):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        days = hours // 24
        return query(f"""
            WITH {_change_pct_cte_90d(days)}
            SELECT
                (i.raw->'i18n'->'en'->>'name')       AS item_name,
                i.slug, i.tags, i.max_rank            AS max_rank,
                i.thumb_path, i.image_path,
                ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
                MIN(s.min_price)                      AS min_price,
                MAX(s.max_price)                      AS max_price,
                SUM(s.volume)                         AS volume,
                ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
            FROM market_stats_90d s
            JOIN market_items i        ON i.id = s.item_id
            JOIN current_price c       ON c.item_id = s.item_id
            LEFT JOIN previous_price p ON p.item_id = s.item_id
            WHERE s.day >= (NOW() - INTERVAL '{days} days')::date
              {tag_clause} {rank_clause}
            GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price
            HAVING SUM(s.volume) >= %s AND MAX(s.max_price) <= AVG(s.avg_price) * 10
            ORDER BY AVG(s.avg_price) DESC
            LIMIT %s
        """, tag_params + [min_volume, limit])

    return query(f"""
        WITH {_change_pct_cte(hours)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')       AS item_name,
            i.slug, i.tags, i.max_rank            AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
            MIN(s.min_price)                      AS min_price,
            MAX(s.max_price)                      AS max_price,
            SUM(s.volume)                         AS volume,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause} {rank_clause}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price
        HAVING SUM(s.volume) >= %s AND MAX(s.max_price) <= AVG(s.avg_price) * 10
        ORDER BY AVG(s.avg_price) DESC
        LIMIT %s
    """, tag_params + [min_volume, limit])


# ──────────────────────────────────────────────
# PRICE MOVERS
# ──────────────────────────────────────────────

def get_price_movers(
    days: int = 7, limit: int = 20, direction: str = "gainers",
    tag: str | None = None, min_volume: int = 3, rank_mode: str = "max",
):
    if direction not in ("gainers", "losers"):
        direction = "gainers"
    order = "DESC" if direction == "gainers" else "ASC"
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause_90d = _rank_clause(rank_mode).replace("s.mod_rank", "d.mod_rank")

    return query(f"""
        WITH
        first_day AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_90d
            WHERE day = (
                SELECT MIN(day) FROM market_stats_90d
                WHERE day >= (NOW() - INTERVAL '{days} days')::date
            )
            GROUP BY item_id
        ),
        last_day AS (
            SELECT item_id, AVG(avg_price) AS price
            FROM market_stats_90d
            WHERE day = (SELECT MAX(day) FROM market_stats_90d)
            GROUP BY item_id
        ),
        total_vol AS (
            SELECT d.item_id, SUM(d.volume) AS total_volume
            FROM market_stats_90d d
            JOIN market_items i ON i.id = d.item_id
            WHERE d.day >= (NOW() - INTERVAL '{days} days')::date
              {rank_clause_90d}
            GROUP BY d.item_id
        )
        SELECT
            (i.raw->'i18n'->'en'->>'name')        AS item_name,
            i.slug, i.tags, i.max_rank             AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(l.price::numeric, 2)             AS current_price,
            ROUND(f.price::numeric, 2)             AS start_price,
            v.total_volume                         AS volume,
            ROUND(((l.price - f.price) / NULLIF(f.price, 0) * 100)::numeric, 1) AS change_pct
        FROM last_day l
        JOIN first_day f    ON f.item_id = l.item_id
        JOIN total_vol v    ON v.item_id = l.item_id
        JOIN market_items i ON i.id = l.item_id
        WHERE f.price > 0 AND l.price > 0
          AND v.total_volume >= %s
          AND (l.price / NULLIF(f.price, 0)) < 100
          AND (l.price / NULLIF(f.price, 0)) > 0.01
          {tag_clause}
        ORDER BY change_pct {order} NULLS LAST
        LIMIT %s
    """, [min_volume] + tag_params + [limit])


# ──────────────────────────────────────────────
# MOST STABLE
# ──────────────────────────────────────────────

def get_most_stable(
    hours: int = 48, limit: int = 20, tag: str | None = None,
    min_volume: int = 5, rank_mode: str = "max",
):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)
    return query(f"""
        SELECT
            (i.raw->'i18n'->'en'->>'name')        AS item_name,
            i.slug, i.tags, i.max_rank             AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)   AS avg_price,
            MIN(s.min_price)                       AS min_price,
            MAX(s.max_price)                       AS max_price,
            SUM(s.volume)                          AS volume,
            ROUND(
                ((MAX(s.max_price) - MIN(s.min_price)) / NULLIF(AVG(s.avg_price), 0))::numeric, 4
            ) AS spread_ratio
        FROM market_stats_48h s
        JOIN market_items i ON i.id = s.item_id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          {tag_clause} {rank_clause}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path
        HAVING SUM(s.volume) >= %s
        ORDER BY spread_ratio ASC NULLS LAST
        LIMIT %s
    """, tag_params + [min_volume, limit])


# ──────────────────────────────────────────────
# DROP SOURCES
# ──────────────────────────────────────────────

def get_drop_sources_for_item(item_id: str, best_only: bool = False):
    if best_only:
        return query("""
            SELECT DISTINCT ON (item_id)
                item_id, source_type, relic_name, relic_era, relic_quality,
                droptable_name, rarity,
                drop_chance_intact, drop_chance_exceptional,
                drop_chance_flawless, drop_chance_radiant,
                drop_chance_enemy, drop_chance_best
            FROM item_drop_sources
            WHERE item_id = %s
            ORDER BY item_id, drop_chance_best DESC
        """, (item_id,))
    return query("""
        SELECT
            source_type, relic_unique_name, relic_era, relic_category,
            relic_name, relic_quality, relic_manifest,
            droptable_name, droptable_path, rarity,
            drop_chance_intact, drop_chance_exceptional,
            drop_chance_flawless, drop_chance_radiant,
            drop_chance_enemy, drop_chance_best
        FROM item_drop_sources
        WHERE item_id = %s
        ORDER BY drop_chance_best DESC
    """, (item_id,))


def get_items_by_drop_filter(
    hours: int = 48, limit: int = 20, tag: str | None = None,
    refinement: str = "intact", source_type: str | None = None,
    sort_by: str = "drop_chance", min_volume: int = 3,
    best_only: bool = False, rank_mode: str = "max",
):
    chance_col_map = {
        "intact": "ds.drop_chance_intact", "exceptional": "ds.drop_chance_exceptional",
        "flawless": "ds.drop_chance_flawless", "radiant": "ds.drop_chance_radiant",
        "enemy": "ds.drop_chance_enemy", "best": "ds.drop_chance_best",
    }
    chance_col = chance_col_map.get(refinement, "ds.drop_chance_intact")
    sort_expr_map = {
        "drop_chance": f"MAX({chance_col}) DESC",
        "value":       "AVG(s.avg_price) DESC",
        "ratio":       f"(AVG(s.avg_price) * MAX({chance_col})) DESC",
    }
    sort_expr = sort_expr_map.get(sort_by, f"MAX({chance_col}) DESC")
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)
    source_clause = "AND ds.source_type = %s" if source_type else ""
    source_params = [source_type] if source_type else []

    return query(f"""
        SELECT
            (i.raw->'i18n'->'en'->>'name')        AS item_name,
            i.slug, i.tags, i.max_rank             AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)   AS avg_price,
            MIN(s.min_price)                       AS min_price,
            MAX(s.max_price)                       AS max_price,
            SUM(s.volume)                          AS volume,
            ROUND(MAX({chance_col})::numeric * 100, 4)                AS best_drop_chance_pct,
            ROUND((AVG(s.avg_price) * MAX({chance_col}))::numeric, 4) AS value_per_drop,
            JSON_AGG(JSON_BUILD_OBJECT(
                'source_type',   ds.source_type,
                'relic_name',    ds.relic_name,
                'relic_quality', ds.relic_quality,
                'droptable',     ds.droptable_name,
                'rarity',        ds.rarity,
                'chance_intact', ds.drop_chance_intact,
                'chance_radiant',ds.drop_chance_radiant,
                'chance_enemy',  ds.drop_chance_enemy
            ) ORDER BY {chance_col} DESC NULLS LAST) AS drop_sources
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN item_drop_sources ds  ON ds.item_id = i.id
        WHERE s.ts >= NOW() - INTERVAL '{hours} hours'
          AND {chance_col} > 0
          {tag_clause} {rank_clause} {source_clause}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path
        HAVING SUM(s.volume) >= %s
        ORDER BY {sort_expr}
        LIMIT %s
    """, tag_params + source_params + [min_volume, limit])


# ──────────────────────────────────────────────
# KATEGORIE / SUCHE
# ──────────────────────────────────────────────

def search_items(search_term: str, limit: int = 10):
    return query("""
        SELECT
            (i.raw->'i18n'->'en'->>'name') AS name,
            i.slug, i.thumb_path,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        JOIN wfpe_items w ON w.unique_name = i.game_ref
        WHERE w.name_en ILIKE %s
          AND s.ts >= NOW() - INTERVAL '48 hours'
        GROUP BY i.id, i.slug, i.thumb_path
        ORDER BY SUM(s.volume) DESC
        LIMIT %s
    """, (f"%{search_term}%", limit))


def get_item_combined(name: str, hours: int = 24):
    wf_data = query("""
        SELECT unique_name, name_en, name_de, export_type, raw
        FROM wfpe_items
        WHERE name_en ILIKE %s
        ORDER BY
            CASE
                WHEN LOWER(name_en) = LOWER(%s) THEN 0
                WHEN name_en ILIKE %s THEN 1
                ELSE 2
            END,
            LENGTH(name_en)
        LIMIT 5
    """, (f"%{name}%", name, f"{name} %"))

    market_data = query(f"""
        SELECT
            (i.raw->'i18n'->'en'->>'name') AS market_name,
            i.slug AS market_slug,
            i.max_rank, i.thumb_path, i.image_path,
            MAX(s.ts) AS last_updated,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        JOIN wfpe_items w ON w.unique_name = i.game_ref
        WHERE w.name_en ILIKE %s
          AND s.ts >= NOW() - INTERVAL '{hours} hours'
        GROUP BY i.id, i.slug, i.max_rank, i.thumb_path, i.image_path
        ORDER BY SUM(s.volume) DESC
        LIMIT 5
    """, (f"%{name}%",))

    return {"wiki": wf_data, "market": market_data}


def get_category_by_tag(tag: str, limit: int = 20):
    if tag == "all":
        return query("""
            SELECT
                (i.raw->'i18n'->'en'->>'name') AS name,
                (i.raw->>'slug') AS slug,
                (i.raw->>'ducats') AS ducats,
                (i.raw->>'tags') AS tags,
                i.max_rank AS max_rank,
                i.thumb_path,
                ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
                MIN(s.min_price) AS min_price,
                MAX(s.max_price) AS max_price,
                SUM(s.volume) AS volume,
                ROUND(MAX(ds.drop_chance_best) * 100, 3) AS best_drop_chance_pct
            FROM market_items i
            JOIN market_stats_48h s ON s.item_id = i.id
            LEFT JOIN (
                SELECT item_id, MAX(drop_chance_best) AS drop_chance_best
                FROM item_drop_sources GROUP BY item_id
            ) ds ON ds.item_id = i.id
            WHERE s.ts >= NOW() - INTERVAL '48 hours'
            GROUP BY i.id, i.max_rank, i.thumb_path
            ORDER BY AVG(s.avg_price)::numeric DESC
            LIMIT %s
        """, (limit,))

    return query("""
        SELECT
            (i.raw->'i18n'->'en'->>'name') AS name,
            (i.raw->>'slug') AS slug,
            (i.raw->>'ducats') AS ducats,
            (i.raw->>'tags') AS tags,
            i.max_rank AS max_rank,
            i.thumb_path,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            MIN(s.min_price) AS min_price,
            MAX(s.max_price) AS max_price,
            SUM(s.volume) AS volume,
            ROUND(MAX(ds.drop_chance_best) * 100, 3) AS best_drop_chance_pct
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        LEFT JOIN (
            SELECT item_id, MAX(drop_chance_best) AS drop_chance_best
            FROM item_drop_sources GROUP BY item_id
        ) ds ON ds.item_id = i.id
        WHERE i.raw->>'tags' IS NOT NULL
          AND i.raw != '[]'
          AND (i.raw->>'tags')::jsonb ? %s
          AND s.ts >= NOW() - INTERVAL '48 hours'
        GROUP BY i.id, i.max_rank, i.thumb_path
        ORDER BY AVG(s.avg_price)::numeric DESC
        LIMIT %s
    """, (tag, limit))


def get_all_category_overview(limit: int = 20):
    return query("""
        SELECT
            (i.raw->>'export_type') AS export_type,
            COUNT(DISTINCT i.id) AS item_count,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            SUM(s.volume) AS total_volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        WHERE s.ts >= NOW() - INTERVAL '48 hours'
        GROUP BY i.raw->>'export_type'
        ORDER BY total_volume DESC
        LIMIT %s
    """, (limit,))


def classify_item_by_tags(tags: str) -> tuple[str, str | None]:
    if not tags or not isinstance(tags, str):
        tags_list = []
    else:
        try:
            import json
            parsed = json.loads(tags)
            tags_list = [t.strip().lower() for t in parsed if isinstance(t, str)]
        except Exception:
            tags_list = [t.strip().lower() for t in tags.split(',') if t.strip()]

    tag_set = set(tags_list)

    if 'arcane_enhancement' in tag_set:
        return ('Arcanes', None)
    if 'relic' in tag_set:
        return ('Relics', None)
    if 'mod' in tag_set or 'augment' in tag_set:
        return ('Mods', None)
    if 'necramech' in tag_set or 'mech' in tag_set:
        return ('Misc', 'Necramech')
    if 'warframe' in tag_set:
        return ('Warframes', None)
    if any(t in tag_set for t in ['primary', 'secondary', 'melee', 'weapon', 'sentinel_weapon', 'archwing']):
        return ('Waffen', None)
    if 'set' in tag_set or 'prime' in tag_set:
        return ('Warframes', None)
    if 'fish' in tag_set:
        return ('Misc', 'Fish')
    if 'arcane_helmet' in tag_set or 'skin' in tag_set:
        return ('Misc', 'Skins & Helmets')
    if 'scene' in tag_set or 'simulacrum' in tag_set:
        return ('Misc', 'Scenes')
    if 'gem' in tag_set or 'resource' in tag_set or 'metal' in tag_set or 'plant' in tag_set:
        return ('Misc', 'Gems & Resources')
    if 'ayatan_sculpture' in tag_set or 'ayatan_star' in tag_set:
        return ('Misc', 'Ayatan')
    if any(t in tag_set for t in ['focus', 'lens', 'kubrow', 'pet', 'imprint', 'key',
                                   'beacon', 'syndicate', 'sentinel', 'misc', 'blueprint',
                                   'component', 'collectible', 'fusion core']):
        return ('Misc', 'Sonstiges')

    return ('Andere', None)