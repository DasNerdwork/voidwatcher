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

import json

from fastapi import FastAPI, Query, Path, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import api.db
import api.warframes

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
    """
    Fehler an den Client — ohne Details.

    Vorher stand hier `str(e)`. Damit gingen rohe Postgres-Meldungen nach außen,
    nachgewiesen etwa „FEHLER: LIMIT darf nicht negativ sein" und bei Spalten-
    oder Syntaxfehlern zusätzlich das Query-Fragment samt Tabellen- und
    Spaltennamen. Die Diagnose gehört ins Journal, nicht in die Antwort.
    """
    import traceback
    traceback.print_exc()
    return JSONResponse(status_code=500,
                        content={"error": "Interner Fehler bei der Verarbeitung der Anfrage."})


@router.get("/")
def api_index():
    return {"message": "VoidWatcher API läuft"}


@router.get("/status")
def api_status():
    try:
        def get(key):
            row = api.db.query("SELECT value FROM metadata WHERE key = %s", (key,))
            return row[0]["value"] if row else None
        return _ok({
            "wf_build_label":              get("wf_build_label"),
            "wf_build_updated_at":         get("wf_build_updated_at"),
            "wf_build_checked_at":         get("wf_build_checked_at"),
            "wf_update_name":              get("wf_update_name"),
            "wf_update_version":           get("wf_update_version"),
            "wf_update_label_updated_at":  get("wf_update_label_updated_at"),
            "wf_update_url":               get("wf_update_url"),
            "wfpe_version":                get("wfpe_version"),
            "wfpe_version_updated_at":     get("wfpe_version_updated_at"),
            "wfm_items_updated_at":        get("wfm_items_updated_at"),
            "last_updated":                get("last_updated"),
        })
    except Exception as e:
        return _err(e)


@router.get("/top")
def top(
    # 2160 h = 90 Tage, die volle Tiefe von market_stats_90d. Der Dashboard-
    # Zeitraum steuert seit der Vereinheitlichung auch den Graphen, deshalb
    # muss er denselben Bereich abdecken wie /api/item/{slug}/history.
    hours: int = Query(24, ge=1, le=2160),
    limit: int = Query(10, ge=1, le=200),
    tag: str | None = Query(None),
    rank_mode: str = Query("max", description="max | unranked | all"),
    metric: str = Query("pct", description="pct = prozentuale Veränderung | abs = Platin-Differenz"),
):
    try:
        last_updated = api.db.get_last_updated()
        metric = metric if metric in ("pct", "abs") else "pct"

        # read_top_list liefert aus der Vorberechnung und fällt selbsttätig auf
        # die Live-Berechnung zurück. Die Umwandlung in JSON-taugliche Werte
        # passiert in db.py, damit beide Wege dieselbe Form ergeben.
        def lst(kind):
            return api.db.read_top_list(kind, hours, limit,
                                        tag=tag, rank_mode=rank_mode, metric=metric)

        return _ok({
            "last_updated":   last_updated,
            "top_performer":  lst("performer"),
            "top_loser":      lst("loser"),
            "top_seller":     lst("seller"),
            "top_traded":     lst("traded"),
        })
    except Exception as e:
        return _err(e)


# Zwischenspeicher der Warframe-Antwort.
#
# Die Basiswerte ändern sich mit einem Warframe-Update, also grob einmal im
# Monat — sie bei jedem Aufruf neu zu berechnen ist Verschwendung, auch bei
# 36 ms. Verworfen wird er über `metadata.last_updated`, denselben Stempel, an
# dem auch `read_top_list()` seine Vorberechnung misst: der Sync setzt ihn, der
# nächste Aufruf rechnet einmal neu.
#
# Kein Lock: kämen zwei Anfragen gleichzeitig durch, rechnete jede einmal — das
# kostet 36 ms doppelt und ist billiger als der Apparat, der es verhindert.
_WF_CACHE: dict = {"stamp": None, "body": None, "etag": None}


@router.get("/warframes")
def warframes(request: Request):
    """
    Basiswerte aller Warframes auf Rang 30, mit spaltenweisem Median.

    Eine Antwort für die ganze Seite: 117 Zeilen sind zu wenig für eine
    Paginierung, und Sortierung, Suche und Filter laufen ohnehin im Browser.
    Drei Median-Sätze, weil die Oberfläche zwischen allen Frames, nur Prime und
    nur Nicht-Prime umschaltet.

    Antwort aus dem Zwischenspeicher (siehe oben), dazu ETag und ein kurzes
    max-age: ein Neuladen innerhalb von zehn Minuten kostet gar keine Anfrage,
    danach genügt eine Revalidierung mit 304. Bewusst KEINE Tage oder Wochen —
    einen Browser-Cache kann niemand von außen leeren, und diese Seite dient dem
    Zahlenvergleich. Der Zwischenspeicher, der die Arbeit spart, sitzt im Server.
    """
    try:
        stamp = api.db.get_last_updated()

        if _WF_CACHE["stamp"] != stamp or _WF_CACHE["body"] is None:
            table = api.warframes.build_table(api.db.get_warframe_rows())
            for w in table["warnings"]:
                print(f"[warframes] {w}")     # ins Journal, nicht in die Antwort
            _WF_CACHE["body"] = {
                "last_updated": stamp,
                "items":        _serialize(table["items"]),
                "medians":      table["medians"],
            }
            _WF_CACHE["etag"] = f'W/"wf-{stamp}"'
            _WF_CACHE["stamp"] = stamp

        headers = {
            "ETag": _WF_CACHE["etag"],
            "Cache-Control": "private, max-age=600",
        }
        if request.headers.get("if-none-match") == _WF_CACHE["etag"]:
            return Response(status_code=304, headers=headers)
        return JSONResponse(content=_WF_CACHE["body"], headers=headers)
    except Exception as e:
        return _err(e)


@router.get("/item/search")
def search_items(q: str = Query(..., min_length=2, max_length=100)):
    try:
        results = api.db.search_items(q, limit=10)
        return _ok({"query": q, "results": _serialize(results)})
    except Exception as e:
        return _err(e)


@router.get("/item/{slug}/detail")
def item_detail(slug: str = Path(..., min_length=1, max_length=120)):
    """Alles für die Item-Detailseite in einem Roundtrip (ohne Zeitreihe)."""
    try:
        item = api.db.get_item_detail(slug)
        if not item:
            return JSONResponse(status_code=404, content={"error": f"Item '{slug}' nicht gefunden"})

        item = _serialize([item])[0]

        tags = item.get("tags") or []
        category, subcategory = api.db.classify_item_by_tags(json.dumps(tags))
        item["category"]    = category
        item["subcategory"] = subcategory

        relic_contents = (
            _serialize(api.db.get_relic_contents(item["name"]))
            if "relic" in tags else []
        )
        set_parts = api.db.get_set_parts(slug)

        return _ok({
            "item":           item,
            "drop_sources":   _serialize(api.db.get_drop_sources_for_slug(slug)),
            "relic_contents": relic_contents,
            "set_parts":      _serialize(set_parts) if set_parts else [],
        })
    except Exception as e:
        return _err(e)


@router.get("/item/{slug}/history")
def item_history(
    slug: str = Path(..., min_length=1, max_length=120),
    hours: int = Query(48, ge=1, le=2160),
    mod_rank: int | None = Query(None, ge=0, le=10),
):
    """Zeitreihe für den Preisgraphen. <=48h stündlich, darüber täglich."""
    try:
        points = api.db.get_item_history(slug, hours=hours, mod_rank=mod_rank)
        return _ok({
            "slug":       slug,
            "hours":      hours,
            "mod_rank":   mod_rank,
            "resolution": "hour" if hours <= 48 else "day",
            "points":     _serialize(points),
        })
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
# /api/market/* ENDPOINTS
# ──────────────────────────────────────────────

@router.get("/market/volume")
def market_volume(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    min_volume: int = Query(3, ge=1, le=100),
    rank_mode: str = Query("max"),
):
    try:
        items = api.db.get_volume_leaders(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({"last_updated": api.db.get_last_updated(), "hours": hours, "tag": tag, "items": _serialize(items)})
    except Exception as e:
        return _err(e)


@router.get("/market/value")
def market_value(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    min_volume: int = Query(3, ge=1, le=100),
    rank_mode: str = Query("max"),
):
    try:
        items = api.db.get_value_leaders(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({"last_updated": api.db.get_last_updated(), "hours": hours, "tag": tag, "outlier_filter": "max_price <= avg_price * 10", "items": _serialize(items)})
    except Exception as e:
        return _err(e)


@router.get("/market/movers")
def market_movers(
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(20, ge=1, le=100),
    direction: str = Query("gainers"),
    tag: str | None = Query(None),
    min_volume: int = Query(3, ge=1),
    rank_mode: str = Query("max"),
):
    if direction not in ("gainers", "losers"):
        return JSONResponse(status_code=422, content={"error": "direction muss 'gainers' oder 'losers' sein"})
    try:
        items = api.db.get_price_movers(days=days, limit=limit, direction=direction, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({"last_updated": api.db.get_last_updated(), "days": days, "direction": direction, "tag": tag, "items": _serialize(items)})
    except Exception as e:
        return _err(e)


@router.get("/market/stable")
def market_stable(
    hours: int = Query(48, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    min_volume: int = Query(5, ge=2),
    rank_mode: str = Query("max"),
):
    try:
        items = api.db.get_most_stable(hours=hours, limit=limit, tag=tag, min_volume=min_volume, rank_mode=rank_mode)
        return _ok({"last_updated": api.db.get_last_updated(), "hours": hours, "tag": tag, "metric": "spread_ratio = (max_price - min_price) / avg_price", "items": _serialize(items)})
    except Exception as e:
        return _err(e)


@router.get("/market/drops")
def market_drops(
    hours: int = Query(24, ge=1, le=720),
    limit: int = Query(20, ge=1, le=100),
    tag: str | None = Query(None),
    rank_mode: str = Query("max"),
    refinement: str = Query("intact"),
    source_type: str | None = Query(None),
    sort_by: str = Query("drop_chance"),
    min_volume: int = Query(3, ge=1),
    best_only: bool = Query(False),
):
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
            hours=hours, limit=limit, tag=tag, refinement=refinement,
            source_type=source_type, sort_by=sort_by, min_volume=min_volume,
            best_only=best_only, rank_mode=rank_mode,
        )
        return _ok({
            "last_updated": api.db.get_last_updated(), "hours": hours, "tag": tag,
            "refinement": refinement, "source_type": source_type, "sort_by": sort_by,
            "items": _serialize(items),
        })
    except Exception as e:
        return _err(e)


@router.get("/drops/{item_id}")
def get_item_drops(
    item_id: str = Path(...),
    best_only: bool = Query(False),
):
    try:
        sources = api.db.get_drop_sources_for_item(item_id, best_only=best_only)
        return _ok({"item_id": item_id, "drop_sources": _serialize(sources)})
    except Exception as e:
        return _err(e)


# ──────────────────────────────────────────────
# CATEGORY
# ──────────────────────────────────────────────

@router.get("/category")
# Grenzen wie bei allen übrigen Endpunkten. Ohne sie ließ ein negatives limit
# den Postgres-Fehler „LIMIT darf nicht negativ sein" bis zum Client durch.
def category(tag: str | None = None, limit: int = Query(20, ge=1, le=500)):
    try:
        last_updated = api.db.get_last_updated()

        if tag == 'all':
            all_items = api.db.get_category_by_tag('all', 99999)
            categories = {}
            for item in all_items:
                # Kategorie bestimmen
                try:
                    tags_json = item.get("tags", "[]")
                    cat, subcat = api.db.classify_item_by_tags(tags_json)
                    item["category"] = cat
                    item["subcategory"] = subcat
                except Exception:
                    cat = "Unsorted"
                    item["category"] = "Unsorted"
                    item["subcategory"] = None

                # Decimal → float/int (immer, unabhängig vom try/except oben)
                item["avg_price"]            = float(item["avg_price"])            if item.get("avg_price")            else None
                item["min_price"]            = float(item["min_price"])            if item.get("min_price")            else None
                item["max_price"]            = float(item["max_price"])            if item.get("max_price")            else None
                item["volume"]               = int(item["volume"])                 if item.get("volume")               else None
                item["best_drop_chance_pct"] = float(item["best_drop_chance_pct"]) if item.get("best_drop_chance_pct") else None

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
                item["avg_price"]            = float(item["avg_price"])            if item.get("avg_price")            else None
                item["min_price"]            = float(item["min_price"])            if item.get("min_price")            else None
                item["max_price"]            = float(item["max_price"])            if item.get("max_price")            else None
                item["volume"]               = int(item["volume"])                 if item.get("volume")               else None
                item["best_drop_chance_pct"] = float(item["best_drop_chance_pct"]) if item.get("best_drop_chance_pct") else None
            return _ok({"last_updated": last_updated, "category": tag, "items": items})

        else:
            overview = api.db.get_all_category_overview(limit)
            return _ok({"last_updated": last_updated, "categories": _serialize(overview)})

    except Exception as e:
        return _err(e)


app.include_router(router)