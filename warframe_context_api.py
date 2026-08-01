#!/usr/bin/env python3
"""
Warframe Context API v2.1
Port: 8061

Routing:
  GET /context?q=Ash                  -> Warframe overview (stats, ability names, farm, patch DATE only)
  GET /context?q=Ash patchnotes       -> Latest patch note(s) with full text
  GET /context?q=Ash Smoke Screen     -> Ability detail (description + augments)
  GET /context?q=Serration            -> Mod / Weapon / etc.
  GET /health
"""

import os
import re
import logging
from pathlib import Path

import psycopg2
import psycopg2.extras
from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / "api/.env")

DB_CONFIG = {
    'dbname':   os.getenv('VW_NAME'),
    'user':     os.getenv('VW_USER'),
    'password': os.getenv('VW_PASSWORD'),
    'host':     os.getenv('VW_HOST', 'localhost'),
    'port':     int(os.getenv('VW_PORT', 5432))
}

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
log = logging.getLogger(__name__)

app = FastAPI(title="Warframe Context API", version="2.1")

# Trigger words that route to patch detail
PATCH_TRIGGERS = {'patchnotes', 'patch', 'patchnote', 'patches', 'update', 'changes', 'changelog'}

# Trigger words that route to ability detail (even if just by number)
ABILITY_NUMBER_MAP = {'1': 0, '2': 1, '3': 2, '4': 3, 'erste': 0, 'zweite': 1, 'dritte': 2,
                      'vierte': 3, 'first': 0, 'second': 1, 'third': 2, 'fourth': 3,
                      '1.': 0, '2.': 1, '3.': 2, '4.': 3}


# ──────────────────────────────────────────────
# DB
# ──────────────────────────────────────────────
def get_conn():
    return psycopg2.connect(**DB_CONFIG, cursor_factory=psycopg2.extras.RealDictCursor)


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def clean(text: str, maxlen: int = 9999) -> str:
    text = str(text)
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\|([A-Z_]+)\|', r'[\1]', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > maxlen:
        text = text[:maxlen - 1] + '…'
    return text


def rotation_from_location(location: str) -> str:
    m = re.search(r'Rotation\s+([ABC])', location, re.IGNORECASE)
    return f" Rot.{m.group(1)}" if m else ""


def format_drops(drops: list, max_items: int = 2) -> str:
    # Filter out near-guaranteed drops (>45%), sort by chance desc
    filtered = sorted(
        [d for d in drops if d.get('chance', 1) <= 0.45],
        key=lambda d: d.get('chance', 0), reverse=True
    )
    if not filtered:
        filtered = sorted(drops, key=lambda d: d.get('chance', 0), reverse=True)
 
    seen = []
    for d in filtered[:max_items]:
        loc         = d.get('location', '')
        rarity      = d.get('rarity', '')
        chance      = d.get('chance', 0)
        mission     = d.get('type', '')
        rot         = rotation_from_location(loc)
        loc_clean   = re.sub(r',?\s*Rotation\s+[ABC]', '', loc, flags=re.IGNORECASE).strip()
        # Railjack nodes list many mission subtypes individually in the wiki,
        # but wfstat only returns one - label generically instead of wrong type
        if 'Proxima' in loc or 'Railjack' in mission:
            suffix = '(Railjack)'
        elif mission:
            suffix = f'({mission})'
        else:
            suffix = ''
        seen.append(f"{loc_clean}{rot} {suffix} {rarity} {round(chance*100,1)}%".strip())
    return ', '.join(seen)

def db_has_prime(name: str) -> bool:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM wfstat_items WHERE LOWER(name) = LOWER(%s) AND category = 'Warframes' LIMIT 1",
                    (f"{name} Prime",)
                )
                return cur.fetchone() is not None
    except Exception:
        return False


# ──────────────────────────────────────────────
# Formatters
# ──────────────────────────────────────────────

def format_warframe_overview(raw: dict) -> str:
    name      = raw.get('name', '?')
    hp        = raw.get('health')
    shield    = raw.get('shield')
    armor     = raw.get('armor')
    energy    = raw.get('power')
    sprint    = raw.get('sprintSpeed') or raw.get('sprint')
    aura      = raw.get('aura', '')
    pols      = raw.get('polarities', [])
    sex       = raw.get('sex', '')
    mastery   = raw.get('masteryReq', 0)
    passive   = raw.get('passiveDescription', '')
    released  = raw.get('releaseDate') or (raw.get('introduced') or {}).get('date', '')
    has_prime = db_has_prime(name)

    parts = []

    # Identity
    id_parts = [name, "Warframe"]
    if sex:      id_parts.append(sex)
    if mastery:  id_parts.append(f"MR{mastery}")
    if released: id_parts.append(f"seit {released}")
    parts.append(f"{id_parts[0]} ({', '.join(id_parts[1:])})")

    # Stats
    stats = []
    if hp:     stats.append(f"HP:{hp}")
    if shield: stats.append(f"Schild:{shield}")
    if armor:  stats.append(f"Rüstung:{armor}")
    if energy: stats.append(f"Energie:{energy}")
    if sprint: stats.append(f"Sprint:{sprint}")
    if aura:   stats.append(f"Aura:{aura}")
    if pols:   stats.append(f"Pol:{','.join(pols)}")
    if stats:
        parts.append(' | '.join(stats))

    # Passive
    if passive:
        parts.append("Passiv: " + clean(passive, 200))

    # Ability NAMES only + routing hint
    abilities = raw.get('abilities', [])
    if abilities:
        ab_names = ' | '.join(f"{i+1}. {ab.get('name','?')}" for i, ab in enumerate(abilities[:4]))
        parts.append("Abilities: " + ab_names)
        parts.append("(Für Ability-Details: '<Frame> <Abilityname>' oder '<Frame> <1-4>' anfragen)")

    # Prime
    parts.append(f"Prime verfügbar: {'Ja' if has_prime else 'Nein'}")

    # Farm
    components = raw.get('components', [])
    farm_parts = []
    for comp in components:
        cname = comp.get('name', '')
        if cname in ('Blueprint', 'Orokin Cell'):
            continue
        drops = comp.get('drops', [])
        if drops:
            farm_parts.append(f"{cname}: {format_drops(drops, max_items=2)}")
    if farm_parts:
        parts.append("Farm: " + " | ".join(farm_parts))

    # Crafting cost/time
    build_cost = raw.get('buildPrice')
    build_time = raw.get('buildTime')
    if build_cost:
        bt_h = round(build_time / 3600) if build_time else '?'
        parts.append(f"Crafting: {build_cost} Credits, {bt_h}h Bauzeit")

    # Latest patch - DATE ONLY here
    patchlogs = raw.get('patchlogs', [])
    if patchlogs:
        latest = patchlogs[0]
        patch_name = latest.get('name', '')
        patch_date = (latest.get('date') or '')[:10]
        parts.append(f"Letzter Patch: {patch_date} – {patch_name}")
        parts.append("(Für Patchdetails: '<Frame> patchnotes' anfragen)")

    return "\n".join(parts)


def format_patch_detail(raw: dict, max_patches: int = 3) -> str:
    name      = raw.get('name', '?')
    patchlogs = raw.get('patchlogs', [])

    if not patchlogs:
        return f"{name}: Keine Patchnotes in der Datenbank."

    parts = [f"Patchnotes für {name}:"]
    shown = 0
    for pl in patchlogs:
        if shown >= max_patches:
            break
        patch_name = pl.get('name', '')
        patch_date = (pl.get('date') or '')[:10]
        # Collect all non-empty text fields
        texts = []
        for field in ('changes', 'fixes', 'additions'):
            val = (pl.get(field) or '').strip()
            if val:
                texts.append(val)
        if not texts:
            continue  # skip empty entries
        parts.append(f"\n{patch_date} – {patch_name}:")
        parts.append(clean(" | ".join(texts), 400))
        shown += 1

    if shown == 0:
        return f"{name}: Patchnotes vorhanden, aber alle Felder leer."

    return "\n".join(parts)


def format_ability_detail(warframe_name: str, ability: dict, augments: list) -> str:
    ab_name = ability.get('name', '?')
    ab_desc = clean(ability.get('description', ''), 300)

    parts = [
        f"{warframe_name} – {ab_name}:",
        ab_desc,
    ]

    if augments:
        aug_strs = []
        for aug in augments[:4]:
            aname = aug.get('name', '?')
            ls    = aug.get('levelStats') or []
            if ls and isinstance(ls, list):
                stats = (ls[-1] or {}).get('stats', [])
                effect = ' / '.join(clean(s, 60) for s in stats[:2]) if stats else ''
            else:
                effect = clean(aug.get('description') or '', 80)
            aug_strs.append(f"{aname}: {effect}" if effect else aname)
        parts.append("Augments: " + " | ".join(aug_strs))
    else:
        parts.append("Augments: keine bekannt")

    parts.append("Hinweis: Ability-Skalierung (Stärke/Reichweite/Dauer) nicht in DB – wiki.warframe.com")

    return "\n".join(parts)


def format_mod(raw: dict) -> str:
    name   = raw.get('name', '?')
    compat = raw.get('compatName') or raw.get('type') or ''
    rarity = raw.get('rarity', '')
    drain  = raw.get('baseDrain')
    url    = raw.get('wikiaUrl', '')

    level_stats = raw.get('levelStats', [])
    effect = ''
    if level_stats:
        last  = level_stats[-1]
        stats = last.get('stats', [])
        if stats:
            effect = ' | '.join(clean(s, 80) for s in stats[:3])

    label = f"{name} (Mod"
    if compat: label += f", {compat}"
    if rarity: label += f", {rarity}"
    label += ")"

    parts = [label]
    if effect: parts.append(f"Max Rank: {effect}")
    if drain is not None: parts.append(f"Drain: {drain}")
    if url: parts.append(url)
    return "\n".join(parts)


def format_weapon(raw: dict, category: str) -> str:
    name    = raw.get('name', '?')
    mastery = raw.get('masteryReq', 0)
    damage  = raw.get('damage') or raw.get('totalDamage')
    crit    = raw.get('criticalChance')
    crit_m  = raw.get('criticalMultiplier')
    status  = raw.get('procChance') or raw.get('statusChance')
    fire_r  = raw.get('fireRate') or raw.get('attackSpeed')
    mag     = raw.get('magazineSize')
    reload  = raw.get('reloadTime')
    desc    = raw.get('description', '')
    url     = raw.get('wikiaUrl', '')

    stats = []
    if damage:  stats.append(f"Schaden:{damage}")
    if crit:    stats.append(f"Krit:{round(crit*100)}%")
    if crit_m:  stats.append(f"x{crit_m}")
    if status:  stats.append(f"Status:{round(status*100)}%")
    if fire_r:  stats.append(f"Feuerrate:{fire_r}")
    if mag:     stats.append(f"Mag:{mag}")
    if reload:  stats.append(f"Reload:{reload}s")

    parts = [f"{name} ({category}, MR{mastery})"]
    if stats: parts.append(' | '.join(stats))
    if desc:  parts.append(clean(desc, 150))
    if url:   parts.append(url)
    return "\n".join(parts)


def format_generic(raw: dict, category: str) -> str:
    name = raw.get('name', '?')
    desc = raw.get('description', '')
    url  = raw.get('wikiaUrl', '')
    parts = [f"{name} ({category})"]
    if desc: parts.append(clean(desc, 200))
    if url:  parts.append(url)
    return "\n".join(parts)


# ──────────────────────────────────────────────
# DB queries
# ──────────────────────────────────────────────

def find_warframe(name: str) -> dict | None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT unique_name, name, category, raw
                FROM wfstat_items
                WHERE category = 'Warframes' AND LOWER(name) = LOWER(%s)
                LIMIT 1
            """, (name,))
            row = cur.fetchone()
            return dict(row) if row else None


def find_ability_in_warframe(warframe_name: str, ability_query: str) -> tuple:
    """
    Returns (warframe_row, ability_dict) or (None, None).
    Supports ability name search AND number (1-4 or ordinal).
    """
    wf = find_warframe(warframe_name)
    if not wf:
        return None, None

    abilities = (wf['raw'] or {}).get('abilities', [])
    if not abilities:
        return None, None

    # Check if query is a number/ordinal
    idx = ABILITY_NUMBER_MAP.get(ability_query.lower().strip('.'))
    if idx is not None and idx < len(abilities):
        return wf, abilities[idx]

    # Search by name (partial match)
    for ab in abilities:
        if ability_query.lower() in ab.get('name', '').lower():
            return wf, ab

    return None, None


def find_augments_for_ability(warframe_name: str, ability_name: str) -> list:
    try:
        keyword = ability_name.lower()[:8]
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT name,
                           raw->>'description' as description,
                           raw->'levelStats'   as levelStats
                    FROM wfstat_items
                    WHERE category = 'Mods'
                      AND (
                        LOWER(raw->>'compatName') = LOWER(%s)
                        OR LOWER(unique_name) LIKE LOWER(%s)
                      )
                      AND (
                        LOWER(name) ILIKE %s
                        OR LOWER(raw->>'description') ILIKE %s
                        OR LOWER(unique_name) ILIKE %s
                      )
                    LIMIT 4
                """, (warframe_name, f'%{warframe_name}%',
                      f'%{keyword}%', f'%{keyword}%', f'%{keyword}%'))
                return [dict(r) for r in cur.fetchall()]
    except Exception as e:
        log.warning(f"Augment lookup failed: {e}")
        return []


def search_generic(query: str, limit: int = 2) -> list:
    query = query.strip()
    words = [w for w in re.split(r'\W+', query) if len(w) >= 3]
    if not words:
        return []

    results = []
    seen = set()

    with get_conn() as conn:
        with conn.cursor() as cur:

            def fetch(sql, params):
                cur.execute(sql, params)
                for row in cur.fetchall():
                    if row['unique_name'] not in seen and len(results) < limit:
                        results.append(dict(row))
                        seen.add(row['unique_name'])

            fetch("SELECT unique_name, name, category, raw FROM wfstat_items WHERE LOWER(name) = LOWER(%s) ORDER BY LENGTH(name) LIMIT %s",
                  (query, limit))

            if len(results) < limit:
                fetch("SELECT unique_name, name, category, raw FROM wfstat_items WHERE LOWER(name) ILIKE %s ORDER BY LENGTH(name) LIMIT %s",
                      (query + '%', limit))

            if len(results) < limit and len(words) > 1:
                cond = ' AND '.join(['LOWER(name) ILIKE %s'] * len(words))
                fetch(f"SELECT unique_name, name, category, raw FROM wfstat_items WHERE {cond} ORDER BY LENGTH(name) LIMIT %s",
                      ['%' + w + '%' for w in words] + [limit])

            if len(results) < limit:
                cond = ' OR '.join(['LOWER(name) ILIKE %s'] * len(words))
                fetch(f"SELECT unique_name, name, category, raw FROM wfstat_items WHERE {cond} ORDER BY LENGTH(name) LIMIT %s",
                      ['%' + w + '%' for w in words] + [limit])

    return results


# ──────────────────────────────────────────────
# Query router
# ──────────────────────────────────────────────

def route_query(q: str) -> dict:
    q = q.strip()
    tokens = q.split()

    # ── 1. Exact warframe match (single token or "Name Prime")
    wf = find_warframe(q)
    if wf:
        raw = wf['raw'] or {}
        return {
            "found": True,
            "type": "warframe_overview",
            "context": format_warframe_overview(raw),
            "meta": {"name": wf['name'], "category": "Warframes"}
        }

    # ── 2. Two-token queries: "<Warframe> <something>"
    if len(tokens) >= 2:
        wf_name    = tokens[0]
        rest       = " ".join(tokens[1:])
        rest_lower = rest.lower()

        # 2a. Patch detail trigger
        if rest_lower in PATCH_TRIGGERS or rest_lower.startswith('patch'):
            wf = find_warframe(wf_name)
            if wf:
                raw = wf['raw'] or {}
                return {
                    "found": True,
                    "type": "patch_detail",
                    "context": format_patch_detail(raw, max_patches=3),
                    "meta": {"name": wf['name'], "category": "Warframes"}
                }

        # 2b. Ability detail (by name or by number)
        wf_row, ability = find_ability_in_warframe(wf_name, rest)
        if wf_row and ability:
            augments = find_augments_for_ability(wf_row['name'], ability.get('name', ''))
            return {
                "found": True,
                "type": "ability_detail",
                "context": format_ability_detail(wf_row['name'], ability, augments),
                "meta": {"warframe": wf_row['name'], "ability": ability.get('name')}
            }

    # ── 3. Generic (Mods, Weapons, Relics…)
    items = search_generic(q)
    if items:
        ctx_parts = []
        meta = []
        for item in items:
            raw      = item.get('raw') or {}
            category = item.get('category') or raw.get('category') or ''
            if category == 'Mods':
                ctx_parts.append(format_mod(raw))
            elif category in ('Primary', 'Secondary', 'Melee', 'Arch-Gun', 'Arch-Melee', 'Shotguns'):
                ctx_parts.append(format_weapon(raw, category))
            else:
                ctx_parts.append(format_generic(raw, category))
            meta.append({"name": item['name'], "category": category})

        return {
            "found": True,
            "type": "generic",
            "context": "\n---\n".join(ctx_parts),
            "meta": meta
        }

    # ── 4. Nothing
    return {"found": False, "type": "none", "context": "", "meta": {}}


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────

@app.get("/context")
def get_context(q: str = Query(..., min_length=2, max_length=300)):
    try:
        result = route_query(q)
        log.info(f"Query: '{q}' → type={result['type']} found={result['found']}")
        return JSONResponse(result)
    except Exception as e:
        log.error(f"Error for '{q}': {e}", exc_info=True)
        return JSONResponse(
            {"found": False, "type": "error", "context": "", "meta": {}, "error": str(e)},
            status_code=500
        )


@app.get("/health")
def health():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS c FROM wfstat_items")
                row = cur.fetchone()
                return {"status": "ok", "wfstat_items": row['c']}
    except Exception as e:
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8061, log_level="info")