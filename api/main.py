from fastapi import FastAPI, Query, Path, APIRouter 
from fastapi.middleware.cors import CORSMiddleware
import api.db

app = FastAPI(title="VoidWatcher API")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

router = APIRouter(prefix="/api")

@router.get("/")
def api_index():
    return {"message": "VoidWatcher API läuft"}

# ──────────────────────────────────────────────
# ITEM-SUCHE ENDPOINTS
# ──────────────────────────────────────────────

@router.get("/item/search")
def search_items(q: str = Query(..., min_length=2, max_length=100)):
    """
    Suche nach Items (Name-Teilmatch).
    
    Query Parameter:
        q: Suchbegriff (min 2, max 100 Zeichen)
    """
    try:
        results = api.db.search_items(q, limit=10)
        return {"query": q, "results": results}
    except Exception as e:
        return {"error": str(e)}


@router.get("/item/{name}")
def get_item(name: str = Path(..., min_length=2, max_length=100), hours: int = Query(24, ge=1, le=720)):
    """
    Kombinierte Item-Daten (Wiki + Market).
    
    Query Parameter:
        name: Item-Name (z.B. "Ash")
        hours: Zeitraum für Market-Preise in Stunden (1-720, Standard: 24)
    """
    try:
        data = api.db.get_item_combined(name, hours=hours)
        return data
    except Exception as e:
        return {"error": str(e)}


@router.get("/item/{name}/stats")
def get_item_stats(name: str = Path(..., min_length=2, max_length=100), hours: int = Query(24, ge=1, le=720)):
    """
    Nur Market-Preise (ohne Wiki-Daten).
    
    Query Parameter:
        name: Item-Name
        hours: Zeitraum in Stunden
    """
    try:
        data = api.db.get_item_market_only(name, hours=hours)
        return data
    except Exception as e:
        return {"error": str(e)}

@router.get("/top")
def top(hours: int = 24, limit: int = 10):
    try:
        last_updated = api.db.get_last_updated()
        top_perf = api.db.get_top_performers(hours, limit)
        top_seller = api.db.get_top_sellers(hours, limit)
        top_traded = api.db.get_most_traded(hours, limit)
        # datetime in ISO-String konvertieren
        for lst in (top_perf, top_seller, top_traded):
            for item in lst:
                item["datetime"] = item["datetime"].isoformat() if item["datetime"] else None
        return {
            "last_updated": last_updated,
            "top_performer": top_perf,
            "top_seller": top_seller,
            "top_traded": top_traded
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


@router.get("/category")
def category(tag: str | None = None, limit: int = 20):
    """
    Kategorie-Daten abrufen.
    - tag (optional): Tag zur Filterung (z.B. 'prime', 'warframe', 'mod', 'weapon', 'relic', 'resource', 'arcane', 'all')
    - limit: Anzahl der Items pro Kategorie
    """
    try:
        last_updated = api.db.get_last_updated()
        
        if tag == 'all':
            # Alle Items abfragen und nach Kategorie gruppieren
            # Wir brauchen mehr Items als limit, um sinnvolle Gruppierung zu ermöglichen
            all_items = api.db.get_category_by_tag('all', limit * 100)
            
            # Items nach Kategorie gruppieren
            categories = {}
            for item in all_items:
                try:
                    # Tags als JSON-String parsen
                    tags_json = item.get("tags", "[]")
                    tags_list = item.get("tags", "[]")
                    
                    # Tags als JSON-Liste parsen
                    import json
                    tags_parsed = json.loads(tags_json)
                    # Tags normalisieren (klein)
                    tags_normalized = ','.join(tags_parsed).lower()
                    # game_ref aus dem Item holen
                    game_ref = item.get("game_ref")
                    category_name = api.db.classify_item_by_tags(tags_normalized, game_ref)
                    # Kategorie-Name zum Item hinzufügen
                    item["category"] = category_name
                except Exception as e:
                    print(f"Fehler bei der Klassifizierung: {e}")
                    category_name = "Andere"
                    item["category"] = "Andere"
                
                # ducats in avg_price umwandeln
                if item.get("ducats"):
                    item["avg_price"] = float(item["ducats"])
                elif item.get("avg_price"):
                    item["avg_price"] = float(item["avg_price"])
                else:
                    item["avg_price"] = None
                item["volume"] = int(item["volume"]) if item["volume"] else None
                
                # Items nach Kategorie gruppieren
                if category_name not in categories:
                    categories[category_name] = []
                categories[category_name].append(item)
            
            # "Andere" Kategorie entfernen
            categories.pop("Andere", None)
            
            # Limit pro Kategorie anwenden
            categorized_items = []
            for cat_name, items in categories.items():
                categorized_items.append({
                    "name": cat_name,
                    "slug": cat_name.lower(),
                    "items": items[:limit]
                })
            
            return {
                "last_updated": last_updated,
                "categories": categorized_items
            }
        elif tag:
            # Einzelne Kategorie nach Tag
            items = api.db.get_category_by_tag(tag, limit)
            # ducats in avg_price umwandeln für konsistente Darstellung
            for item in items:
                if item.get("ducats"):
                    item["avg_price"] = float(item["ducats"])
                else:
                    item["avg_price"] = None
                item["volume"] = int(item["volume"]) if item["volume"] else None
            return {
                "last_updated": last_updated,
                "category": tag,
                "items": items
            }
        else:
            # Alle Kategorien-Overview (nur ohne Items)
            overview = api.db.get_all_category_overview(limit)
            return {
                "last_updated": last_updated,
                "categories": overview
            }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}
app.include_router(router)
