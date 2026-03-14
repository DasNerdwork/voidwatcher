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


# ---- CATEGORY QUERIES ---- #

def get_category_stats(export_type, limit):
    """
    Statistiken für eine Kategorie (Export-Typ) aus der Datenbank.
    Verwendet market_stats_48h für aktuelle Preise.
    """
    return query(f"""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS name,
            (i.raw->>'slug') AS slug,
            (i.raw->>'export_type') AS export_type,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            SUM(s.volume) AS volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        WHERE (i.raw->>'export_type') = %s
          AND s.ts >= NOW() - INTERVAL '48 hour'
        GROUP BY i.id, i.raw->>'slug', i.raw->>'export_type'
        ORDER BY AVG(s.avg_price)::numeric DESC
        LIMIT %s;
    """, (export_type, limit))


def get_all_category_overview(limit=20):
    """
    Übersicht aller Kategorien mit aggregierten Daten.
    """
    return query("""
        SELECT 
            (i.raw->>'export_type') AS export_type,
            COUNT(DISTINCT i.id) AS item_count,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            SUM(s.volume) AS total_volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        WHERE s.ts >= NOW() - INTERVAL '48 hour'
        GROUP BY i.raw->>'export_type'
        ORDER BY total_volume DESC
        LIMIT %s;
    """, (limit,))


# ---- TAGS-BASIERTE KATEGORIE QUERIES ---- #

def get_category_by_tag(tag: str, limit: int = 20):
    """
    Items nach Tag filtern (z.B. 'prime', 'warframe', 'mod', 'weapon', 'blueprint', 'set', 'relic', 'resource', 'arcane').
    """
    # Wenn tag 'all' ist, alle Items zurückgeben
    if tag == 'all':
        return query("""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS name,
            (i.raw->>'slug') AS slug,
            (i.raw->>'ducats') AS ducats,
            (i.raw->>'tags') AS tags,
            (i.game_ref) AS game_ref,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            SUM(s.volume) AS volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        WHERE s.ts >= NOW() - INTERVAL '48 hour'
        GROUP BY i.id
        ORDER BY AVG(s.avg_price)::numeric DESC
        LIMIT %s;
    """, (limit,))
    
    # Sonst nach Tag filtern - JSONB ? operator prüft, ob das Feld den Tag enthält
    return query(f"""
        SELECT 
            (i.raw->'i18n'->'en'->>'name') AS name,
            (i.raw->>'slug') AS slug,
            (i.raw->>'ducats') AS ducats,
            (i.raw->>'tags') AS tags,
            ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
            SUM(s.volume) AS volume
        FROM market_items i
        JOIN market_stats_48h s ON s.item_id = i.id
        WHERE i.raw->>'tags' IS NOT NULL 
          AND i.raw != '[]'
          AND (i.raw->>'tags')::jsonb ? %s
          AND s.ts >= NOW() - INTERVAL '48 hour'
        GROUP BY i.id
        ORDER BY AVG(s.avg_price)::numeric DESC
        LIMIT %s;
    """, (tag, limit))

def get_all_tags():
    """
    Alle einzigartigen Tags aus der Datenbank zurückgeben, die im Mapping existieren.
    """
    # Nur Tags, die im Mapping existieren
    mapping_tags = ['prime', 'warframe', 'set', 'mod', 'augment', 'rare', 
                    'weapon', 'primary', 'secondary', 'melee', 'blueprint',
                    'relic', 'resource', 'arcane', 'legendary', 'common',
                    'kuva', 'cell', 'extract', 'forma', 'arcane_helmet',
                    'skin', 'helmet', 'enhancement']
    
    # SQL mit LATERAL JOIN
    sql = """
        SELECT DISTINCT sub.tag
        FROM market_items m
        CROSS JOIN LATERAL jsonb_array_elements_text((m.raw->>'tags')::jsonb) AS sub(tag)
        WHERE m.raw->>'tags' IS NOT NULL 
          AND m.raw != '[]'
          AND sub.tag IN ({tags})
        ORDER BY sub.tag;
    """
    # Tags als SQL-String für IN-Clause
    tags_str = ', '.join([f"'{t}'" for t in mapping_tags])
    return query(sql.format(tags=tags_str))

def get_categories_mapping():
    """
    Mapping von Tags zu Kategorien für die Frontend-Anzeige.
    """
    return {
        'prime': 'Warframes',
        'warframe': 'Warframes',
        'set': 'Warframes',
        'mod': 'Mods',
        'augment': 'Mods',
        'rare': 'Mods',
        'weapon': 'Waffen',
        'primary': 'Waffen',
        'secondary': 'Waffen',
        'melee': 'Waffen',
        'blueprint': 'Waffen',
        'relic': 'Relics',
        'resource': 'Ressourcen',
        'arcane': 'Arcanes',
        'legendary': 'Arcanes',
        'rare': 'Arcanes',
        'common': 'Arcanes',
        'kuva': 'Ressourcen',
        'cell': 'Ressourcen',
        'extract': 'Ressourcen',
        'forma': 'Ressourcen',
    }

def classify_item_by_tags(tags: str, game_ref: str | None = None) -> str:
    """
    Klassifiziert ein Item basierend auf seinen Tags und/oder game_ref.
    
    Prioritäten:
    1. game_ref auf /Lotus/Powersuits/ (außer Archwing) -> Warframes
    2. 'warframe' Tag -> Warframe (auch wenn 'set' oder 'prime' vorhanden)
    3. 'weapon', 'primary', 'secondary', 'melee' Tags -> Waffen
    4. 'relic' -> Relics
    5. 'resource', 'arcane', 'cell', 'extract', 'forma', 'kuva' -> Ressourcen
    6. 'prime', 'set', 'mod', 'augment' -> Warframes (nur wenn kein spezifischerer Tag)
    
    Args:
        tags: String von Tags, getrennt durch Komma und Leerzeichen (z.B. 'arcane_helmet,skin')
              oder None/empty string für Items ohne Tags
        game_ref: Optionaler Pfad aus game_ref Feld (z.B. '/Lotus/Powersuits/Ember/EmberPrime')
        
    Returns:
        Kategorie-Name für die Frontend-Anzeige
    """
    # Tags in eine Liste umwandeln
    if not tags or not isinstance(tags, str):
        tags_list = []
    else:
        tags_list = [tag.strip().lower() for tag in tags.split(',') if tag.strip()]
    
    # game_ref hat höchste Priorität - bestimmt die Kategorie direkt
    if game_ref:
        game_ref_lower = game_ref.lower()
        # Powersuits (außer Archwing) sind echte Warframes
        if game_ref_lower.startswith('/lotus/powersuits/'):
            if '/archwing/' not in game_ref_lower:
                return 'Warframes'
            else:
                # Archwings sind keine Warframes
                weapon_tags = ['weapon', 'primary', 'secondary', 'melee', 'blueprint']
                if any(tag in tags_list for tag in weapon_tags):
                    return 'Waffen'
                return 'Andere'
        
        # Weapons sind Waffen
        if '/weapons/' in game_ref_lower or '/types/' in game_ref_lower:
            weapon_tags = ['weapon', 'primary', 'secondary', 'melee', 'blueprint']
            if any(tag in tags_list for tag in weapon_tags):
                return 'Waffen'
            return 'Andere'
        
        # Mods
        if '/upgrades/mods/' in game_ref_lower or '/mods/' in game_ref_lower:
            return 'Mods'
        
        # Relics
        if '/relics/' in game_ref_lower:
            return 'Relics'
    
    # Falls game_ref nicht vorhanden, auf Tags zurückgreifen
    # Warframe hat höchste Priorität - auch wenn 'set' oder 'prime' vorhanden
    if 'warframe' in tags_list:
        return 'Warframes'
    
    # Waffen-Tags
    weapon_tags = ['weapon', 'primary', 'secondary', 'melee', 'blueprint']
    if any(tag in tags_list for tag in weapon_tags):
        return 'Waffen'
    
    # Relics
    if 'relic' in tags_list:
        return 'Relics'
    
    # Ressourcen
    resource_tags = ['resource', 'arcane', 'legendary', 'common', 'kuva', 'cell', 'extract', 'forma']
    if any(tag in tags_list for tag in resource_tags):
        return 'Ressourcen'
    
    # Arcanes (falls arcane vorhanden)
    if 'arcane' in tags_list:
        return 'Arcanes'
    
    # Arcane Helms/Enhancements (falls vorhanden)
    if any(tag.startswith('arcane') for tag in tags_list):
        return 'Arcanes'
    
    # Mods
    mod_tags = ['mod', 'augment', 'rare']
    if any(tag in tags_list for tag in mod_tags):
        return 'Mods'
    
    # Sets (nur wenn kein Warframe-Tag vorhanden)
    if 'set' in tags_list:
        return 'Warframes'
    
    # Prime (nur wenn kein spezifischerer Tag vorhanden)
    if 'prime' in tags_list:
        return 'Warframes'
    
    # Fallback: Wenn keine spezifische Kategorie gefunden wurde
    return 'Andere'

def get_category_for_item(tags: str) -> str:
    """
    Erstellt eine Hilfsfunktion, die die Kategorie für ein Item zurückgibt.
    Wird verwendet, um die API-Daten mit der korrekten Kategorie anzureichern.
    """
    return classify_item_by_tags(tags)
