"""
VoidWatcher – API Routen (Erweiterungen)
============================================================
Neue Endpoints:

  GET /api/market/volume      – Meistgehandelt (Feature 1)
  GET /api/market/value       – Teuerste + Outlier-Filter (Feature 2)
  GET /api/market/movers      – Preis-Gewinner / Verlierer (Feature 3)
  GET /api/market/stable      – Stabilste Items (Feature 4)
  GET /api/market/drops       – Mit Drop-Chance-Filter (Feature 6 + 7)
  GET /api/drops/{item_id}    – Drop-Quellen für ein Item

Alle Market-Endpoints unterstützen:
  ?tag=mod|prime|relic|weapon|...   – Tag-Filter (Feature 5)
  ?limit=20                         – Anzahl Ergebnisse
  ?min_volume=3                     – Mindest-Handelsvolumen

Bestehende Endpoints bleiben unverändert.
"""

from fastapi import FastAPI, Query, Path, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import api.db

app = FastAPI(title="VoidWatcher API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

router = APIRouter(prefix="/api")


def _serialize(items: list) -> list:
    """Konvertiert psycopg2 RealDictRow + Decimal/datetime → JSON-serialisierbar."""
    import decimal
    import datetime
    result = []
    for item in items:
        row = dict(item)
        for k, v in row.items():
            if isinstance(v, decimal.Decimal):
                row[k] = float(v)
            elif isinstance(v, (datetime.datetime, datetime.date)):
                row[k] = v.isoformat()
        result.append(row)
    return result


def _ok(data: dict) -> JSONResponse:
    return JSONResponse(content=data)


def _err(e: Exception) -> JSONResponse:
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": str(e)})


# ──────────────────────────────────────────────
# BESTEHENDE ENDPOINTS (unverändert + rückwärtskompatibel)
# ──────────────────────────────────────────────

@router.get("/")
def api_index():
    return {"message": "VoidWatcher API läuft"}


@router.get("/top")
def top(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(10, ge=1, le=200),
    tag: str | None = Query(None),
    rank_mode: str = Query("max", description="max | unranked | all"),
):
    """
    Legacy-Endpoint: Top Performer / Seller / Traded in einem Call.
    Neu: unterstützt jetzt optional ?tag= Filter.
    """
    try:
        last_updated = api.db.get_last_updated()
        top_perf   = api.db.get_top_performers(hours, limit, tag=tag, rank_mode=rank_mode)
        top_seller = api.db.get_top_sellers(hours, limit, tag=tag, rank_mode=rank_mode)
        top_traded = api.db.get_most_traded(hours, limit, tag=tag, rank_mode=rank_mode)

        for lst in (top_perf, top_seller, top_traded):
            for item in lst:
                item["datetime"] = item["datetime"].isoformat() if item.get("datetime") else None
                cp = item.get("change_pct")
                item["change_pct"] = float(cp) if cp is not None else None

        return _ok({
            "last_updated":   last_updated,
            "top_performer":  _serialize(top_perf),
            "top_seller":     _serialize(top_seller),
            "top_traded":     _serialize(top_traded),
        })
    except Exception as e:
        return _err(e)


@router.get("/item/search")
def search_items(q: str = Query(..., min_length=2, max_length=100)):
    try:
        results = api.db.search_items(q, limit=10)
        return _ok({"query": q, "results": _serialize(results)})
    except Exception as e:
        return _err(e)


@router.get("/item/{name}")
def get_item(
    name: str = Path(..., min_length=2, max_length=100),
    hours: int = Query(24, ge=1, le=720),
):
    try:
        data = api.db.get_item_combined(name, hours=hours)
        return _ok(data)
    except Exception as e:
        return _err(e)


# ──────────────────────────────────────────────
# NEU: /api/market/* ENDPOINTS
# ──────────────────────────────────────────────

@router.get("/market/volume")
def market_volume(
    hours: int = Query(24, ge=1, le=720, description="Zeitraum in Stunden"),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None, description="Tag-Filter z.B. mod, prime, relic"),
    min_volume: int = Query(3, ge=1, le=100, description="Mindest-Handelsvolumen"),
    rank_mode: str = Query("max", description="max | unranked | all"),
):
    """
    Feature 1 – Meistverkaufte Items nach Handelsvolumen.
    """
    try:
        items = api.db.get_volume_leaders(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({
            "last_updated": api.db.get_last_updated(),
            "hours": hours,
            "tag": tag,
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


@router.get("/market/value")
def market_value(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    min_volume: int = Query(3, ge=1, le=100, description="Manipulation-Schutz: mind. N Trades"),
    rank_mode: str = Query("max", description="max | unranked | all"),
):
    """
    Feature 2 – Teuerste Items mit Preismanipulations-Schutz.
    Filtert Items raus wo MAX(price) > 10× AVG(price).
    """
    try:
        items = api.db.get_value_leaders(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({
            "last_updated": api.db.get_last_updated(),
            "hours": hours,
            "tag": tag,
            "outlier_filter": "max_price <= avg_price * 10",
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


@router.get("/market/movers")
def market_movers(
    days: int = Query(7, ge=1, le=90, description="Zeitraum in Tagen (nutzt 90d-Daten)"),
    limit: int = Query(20, ge=1, le=100),
    direction: str = Query("gainers", description="gainers oder losers"),
    tag: str | None = Query(None),
    min_volume: int = Query(3, ge=1),
    rank_mode: str = Query("max", description="max | unranked | all"),
):
    """
    Feature 3 – Größte Preisbewegungen (Gewinner / Verlierer).
    Vergleicht ersten vs. letzten Tag im Zeitfenster.
    Nutzt market_stats_90d, daher bis zu 90 Tage möglich.
    """
    if direction not in ("gainers", "losers"):
        return JSONResponse(status_code=422, content={"error": "direction muss 'gainers' oder 'losers' sein"})
    try:
        items = api.db.get_price_movers(days=days, limit=limit, direction=direction, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({
            "last_updated": api.db.get_last_updated(),
            "days": days,
            "direction": direction,
            "tag": tag,
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


@router.get("/market/stable")
def market_stable(
    hours: int = Query(48, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    min_volume: int = Query(5, ge=2, description="Höherer Default: 1 Trade = immer 0 Spread"),
    rank_mode: str = Query("max", description="max | unranked | all"),
):
    """
    Feature 4 – Stabilste Items nach Preis-Spread.
    Spread-Ratio = (max - min) / avg. Niedrigster Wert = stabilster Markt.
    """
    try:
        items = api.db.get_most_stable(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({
            "last_updated": api.db.get_last_updated(),
            "hours": hours,
            "tag": tag,
            "metric": "spread_ratio = (max_price - min_price) / avg_price",
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


@router.get("/market/drops")
def market_drops(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None, description="z.B. mod, prime, relic"),
    rank_mode: str = Query("max", description="max | unranked | all"),
    refinement: str = Query(
        "intact",
        description="intact | exceptional | flawless | radiant | enemy | best"
    ),
    source_type: str | None = Query(
        None,
        description="Nur 'relic' oder 'enemy' – None = alle"
    ),
    sort_by: str = Query(
        "drop_chance",
        description="drop_chance | value | ratio (value × drop_chance)"
    ),
    min_volume: int = Query(3, ge=1),
    best_only: bool = Query(
        False,
        description="True = nur beste Drop-Quelle pro Item anzeigen"
    ),
):
    """
    Feature 6 + 7 – Items gefiltert und sortiert nach Drop-Chance.

    Kombinierbare Filter:
      - tag=mod + sort_by=drop_chance  → Mods mit höchster Drop-Rate
      - tag=mod + sort_by=value        → Teuerste Mods mit Drop-Daten
      - tag=mod + sort_by=ratio        → Beste Wert/Drop-Effizienz für Mods
      - source_type=relic              → Nur Relic-Drops
      - refinement=radiant             → Chancen mit Radiant-Refinement
    """
    valid_refinements = {"intact", "exceptional", "flawless", "radiant", "enemy", "best"}
    valid_sorts = {"drop_chance", "value", "ratio"}
    valid_sources = {None, "relic", "enemy"}

    if refinement not in valid_refinements:
        return JSONResponse(status_code=422, content={"error": f"refinement muss einer von {valid_refinements} sein"})
    if sort_by not in valid_sorts:
        return JSONResponse(status_code=422, content={"error": f"sort_by muss einer von {valid_sorts} sein"})
    if source_type not in valid_sources:
        return JSONResponse(status_code=422, content={"error": "source_type muss 'relic', 'enemy' oder leer sein"})

    try:
        items = api.db.get_items_by_drop_filter(
            hours=hours,
            limit=limit,
            tag=tag,
            refinement=refinement,
            source_type=source_type,
            sort_by=sort_by,
            min_volume=min_volume,
            best_only=best_only,
            rank_mode=rank_mode,
        )
        return _ok({
            "last_updated": api.db.get_last_updated(),
            "hours": hours,
            "tag": tag,
            "refinement": refinement,
            "source_type": source_type,
            "sort_by": sort_by,
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


# ──────────────────────────────────────────────
# NEU: /api/drops/{item_id}
# ──────────────────────────────────────────────

@router.get("/drops/{item_id}")
def get_item_drops(
    item_id: str = Path(..., description="Market-Item ID"),
    best_only: bool = Query(False, description="Nur beste Drop-Quelle zurückgeben"),
):
    """
    Alle Drop-Quellen für ein spezifisches Market-Item.
    Gibt Relic-Chancen für alle 4 Refinement-Stufen zurück.
    """
    try:
        sources = api.db.get_drop_sources_for_item(item_id, best_only=best_only)
        return _ok({
            "item_id": item_id,
            "drop_sources": _serialize(sources),
        })
    except Exception as e:
        return _err(e)


# ──────────────────────────────────────────────
# APP SETUP
# ──────────────────────────────────────────────

@router.get("/category")
def category(tag: str | None = None, limit: int = 20):
    try:
        last_updated = api.db.get_last_updated()

        if tag == 'all':
            all_items = api.db.get_category_by_tag('all', 99999)
            categories = {}
            for item in all_items:
                try:
                    tags_json = item.get("tags", "[]")
                    cat, subcat = api.db.classify_item_by_tags(tags_json)
                    item["category"] = cat
                    item["subcategory"] = subcat
                except Exception:
                    cat = "Andere"
                    item["category"] = "Andere"
                    item["subcategory"] = None

                item["avg_price"] = float(item["avg_price"]) if item.get("avg_price") else None
                item["min_price"] = float(item["min_price"]) if item.get("min_price") else None  # neu
                item["max_price"] = float(item["max_price"]) if item.get("max_price") else None  # neu
                item["volume"]    = int(item["volume"])    if item.get("volume")    else None

                if cat != "Andere":
                    categories.setdefault(cat, []).append(item)

            categorized_items = [
                {"name": k, "slug": k.lower(), "items": v}
                for k, v in categories.items()
            ]
            return _ok({"last_updated": last_updated, "categories": categorized_items})

        elif tag:
            items = api.db.get_category_by_tag(tag, limit)
            for item in items:
                item["avg_price"] = float(item["ducats"]) if item.get("ducats") else None
                item["volume"] = int(item["volume"]) if item.get("volume") else None
            return _ok({"last_updated": last_updated, "category": tag, "items": items})

        else:
            overview = api.db.get_all_category_overview(limit)
            return _ok({"last_updated": last_updated, "categories": _serialize(overview)})

    except Exception as e:
        return _err(e)

app.include_router(router)