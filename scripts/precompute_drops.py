"""
VoidWatcher – Pre-Compute: item_drop_sources
============================================================
Liest ExportRewards (Relic-Drops) und ExportEnemies (Enemy-Drops)
aus wfpe_items, verknüpft sie über game_ref mit market_items
und schreibt das Ergebnis in item_drop_sources.

Wird nach jedem WFPE-Sync aufgerufen (z.B. 1x täglich).

HINWEIS: ExportRelics-Einträge müssen `rewardManifest` und `quality`
im raw-JSONB enthalten. Falls dein Sync-Skript diese Felder filtert,
musst du sie dort ergänzen.

Relic-Drop-Chancen (Intact / Exceptional / Flawless / Radiant):
  COMMON:    1/3 der Slots  →  0.2533 / 0.2333 / 0.20  / 0.1667
  UNCOMMON:  1/2 der Slots  →  0.11   / 0.13   / 0.17  / 0.20
  RARE:      1 Slot         →  0.02   / 0.04   / 0.06  / 0.10
(Standard-Relic: 3x COMMON, 2x UNCOMMON, 1x RARE)
"""

import os
import logging
from collections import defaultdict
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from pathlib import Path
load_dotenv(Path(__file__).resolve().parent.parent / "api" / ".env")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("precompute_drops")

# ──────────────────────────────────────────────
# Relic Drop-Chancen (per rarity, per refinement)
# ──────────────────────────────────────────────

# Chance, das *spezifische* Item zu bekommen.
# Basiert auf Standard-Relic: 3 COMMON / 2 UNCOMMON / 1 RARE.
# Bei nicht-Standard-Relics wird dynamisch per Manifest berechnet.
RELIC_BASE_CHANCES = {
    "VPQ_BRONZE":   {"COMMON": 0.76, "UNCOMMON": 0.22, "RARE": 0.02},
    "VPQ_SILVER":   {"COMMON": 0.70, "UNCOMMON": 0.26, "RARE": 0.04},
    "VPQ_GOLD":     {"COMMON": 0.60, "UNCOMMON": 0.34, "RARE": 0.06},
    "VPQ_PLATINUM": {"COMMON": 0.50, "UNCOMMON": 0.40, "RARE": 0.10},
}

QUALITY_ORDER = ["VPQ_BRONZE", "VPQ_SILVER", "VPQ_GOLD", "VPQ_PLATINUM"]
INTACT = "VPQ_BRONZE"

ERA_NAMES = {
    "T1": "Lith", "T2": "Meso", "T3": "Neo", "T4": "Axi",
    "S": "Requiem", "S10": "Neo",  # S10 = Neo (Alert Relics)
}


def get_conn():
    return psycopg2.connect(
        host=os.getenv("VW_HOST"),
        port=os.getenv("VW_PORT"),
        user=os.getenv("VW_USER"),
        password=os.getenv("VW_PASSWORD"),
        dbname=os.getenv("VW_NAME"),
    )


def norm_path(path: str) -> str:
    """Normalisiert StoreItem-Pfade → normale Pfade."""
    if path and path.startswith("/Lotus/StoreItems/"):
        return "/Lotus/" + path[len("/Lotus/StoreItems/"):]
    return path


def calc_specific_chance(total_chance: float, n_items_in_rarity: int) -> float:
    """
    Berechnet die Chance für *ein bestimmtes* Item einer Seltenheitsstufe.
    z.B. 3 COMMON Items → chance pro Item = total_COMMON / 3
    """
    if n_items_in_rarity <= 0:
        return 0.0
    return total_chance / n_items_in_rarity


def resolve_relic_name(era: str, category: str) -> str:
    """Erstellt lesbaren Relic-Namen, z.B. 'Neo A1'."""
    era_label = ERA_NAMES.get(era, era)
    return f"{era_label} {category}"


# ──────────────────────────────────────────────
# RELIC DROPS
# ──────────────────────────────────────────────

def build_relic_drops(conn) -> list[dict]:
    """
    Baut alle Relic-Drop-Einträge für item_drop_sources.

    Join-Kette:
      market_items.game_ref
        → wfpe_items (ExportRecipes/ExportRelics) .unique_name
        → ExportRewards._rewardTable (via norm_path(reward.type) == market_items.game_ref)
        + ExportRelics.raw.rewardManifest → Relic-Metadaten (era, category, quality)
    """
    log.info("Lade ExportRewards ...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT unique_name, raw
            FROM wfpe_items
            WHERE export_type = 'ExportRewards'
        """)
        rewards_rows = cur.fetchall()

    log.info("Lade ExportRelics ...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT unique_name, raw
            FROM wfpe_items
            WHERE export_type = 'ExportRelics'
        """)
        relics_rows = cur.fetchall()

    log.info("Lade market_items (game_ref) ...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, game_ref FROM market_items WHERE game_ref IS NOT NULL")
        market_items = {row["game_ref"]: row["id"] for row in cur.fetchall()}

    # Baut: manifest_key → list of rewards
    # Jede Reward-Row hat: type (item path), rarity, probability, _rewardTable
    manifest_rewards: dict[str, list[dict]] = defaultdict(list)
    for row in rewards_rows:
        raw = row["raw"]
        if not raw:
            continue
        table_key = raw.get("_rewardTable")
        item_type = norm_path(raw.get("type", ""))
        rarity = raw.get("rarity")
        if not (table_key and item_type and rarity):
            continue
        manifest_rewards[table_key].append({
            "item_path": item_type,
            "rarity": rarity,
        })

    # Baut: manifest_key → list of relic projections (era, category, quality)
    # HINWEIS: erfordert rewardManifest + quality im raw der ExportRelics-Rows
    manifest_relics: dict[str, list[dict]] = defaultdict(list)
    for row in relics_rows:
        raw = row["raw"]
        if not raw:
            continue
        manifest = raw.get("rewardManifest")
        quality = raw.get("quality")
        era = raw.get("era", "?")
        category = raw.get("category", "?")
        if not (manifest and quality):
            # Fehlende Felder → Warnung, skip
            continue
        manifest_relics[manifest].append({
            "relic_unique_name": row["unique_name"],
            "relic_era": era,
            "relic_category": category,
            "relic_name": resolve_relic_name(era, category),
            "relic_quality": quality,
            "relic_manifest": manifest,
        })

    # Für jedes Relic-Manifest: Chancen pro Seltenheit dynamisch berechnen
    entries = []
    manifests_processed = 0
    items_matched = 0
    items_skipped = 0

    for manifest_key, rewards in manifest_rewards.items():
        # Zähle Items pro Rarity für dynamische Chance-Berechnung
        rarity_counts: dict[str, int] = defaultdict(int)
        for r in rewards:
            rarity_counts[r["rarity"]] += 1

        relics_for_manifest = manifest_relics.get(manifest_key, [])
        if not relics_for_manifest:
            # Kein Relic gefunden für dieses Manifest (z.B. Mission-Rewards, kein Relic)
            continue

        manifests_processed += 1

        for reward in rewards:
            item_path = reward["item_path"]
            rarity = reward["rarity"]
            market_item_id = market_items.get(item_path)

            if not market_item_id:
                items_skipped += 1
                continue

            items_matched += 1
            n_same_rarity = rarity_counts.get(rarity, 1)

            # Berechne Chance für jede Refinement-Stufe
            chances = {}
            for quality in QUALITY_ORDER:
                total = RELIC_BASE_CHANCES[quality].get(rarity, 0)
                chances[quality] = calc_specific_chance(total, n_same_rarity)

            best_chance = max(chances.values())

            # Für jeden Relic, der dieses Manifest verwendet, einen Eintrag erstellen
            # (meist 4 Einträge: Bronze/Silver/Gold/Platinum der gleichen Base-Relic)
            # Wir deduplizieren auf Basis (item_id, relic_unique_name)
            seen_relics = set()
            for relic in relics_for_manifest:
                key = (market_item_id, relic["relic_unique_name"])
                if key in seen_relics:
                    continue
                seen_relics.add(key)

                entries.append({
                    "item_id": market_item_id,
                    "source_type": "relic",
                    "relic_unique_name": relic["relic_unique_name"],
                    "relic_era": relic["relic_era"],
                    "relic_category": relic["relic_category"],
                    "relic_name": relic["relic_name"],
                    "relic_quality": relic["relic_quality"],
                    "relic_manifest": manifest_key,
                    "droptable_name": None,
                    "droptable_path": None,
                    "rarity": rarity,
                    "drop_chance_intact": chances["VPQ_BRONZE"],
                    "drop_chance_exceptional": chances["VPQ_SILVER"],
                    "drop_chance_flawless": chances["VPQ_GOLD"],
                    "drop_chance_radiant": chances["VPQ_PLATINUM"],
                    "drop_chance_enemy": None,
                    "drop_chance_best": best_chance,
                })

    log.info(
        "Relics: %d Manifests verarbeitet, %d Market-Items gematcht, %d übersprungen",
        manifests_processed, items_matched, items_skipped,
    )
    return entries


# ──────────────────────────────────────────────
# ENEMY DROPS
# ──────────────────────────────────────────────

def build_enemy_drops(conn) -> list[dict]:
    """
    Baut alle Enemy-Drop-Einträge für item_drop_sources.

    ExportEnemies hat 6 Rows. Die Row mit dem 'droptables'-Key enthält
    ein JSONB-Objekt: { "TablePath": [ { type, chance, items: [{type, probability}] } ] }

    Effektive Drop-Chance = drop_group.chance * item.probability
    """
    log.info("Lade ExportEnemies (droptables) ...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT unique_name, raw
            FROM wfpe_items
            WHERE export_type = 'ExportEnemies'
        """)
        enemy_rows = cur.fetchall()

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, game_ref FROM market_items WHERE game_ref IS NOT NULL")
        market_items = {row["game_ref"]: row["id"] for row in cur.fetchall()}

    # Finde die Row mit dem 'droptables'-Key
    droptables_blob: dict = {}
    for row in enemy_rows:
        if row["unique_name"] == "droptables":
            droptables_blob = row["raw"]
            log.info("droptables gefunden (%d Tabellen)", len(droptables_blob))
            break

    if not droptables_blob:
        log.warning("Keine droptables in ExportEnemies gefunden!")
        return []

    entries = []
    matched = 0
    skipped = 0

    # Sammle zuerst alle Drop-Chancen pro Item über alle Droptabellen
    # item_path → list of {droptable_path, droptable_name, effective_chance}
    item_drops: dict[str, list[dict]] = defaultdict(list)

    for table_path, drop_groups in droptables_blob.items():
        table_name = table_path.split("/")[-1]  # Kurzname

        if not isinstance(drop_groups, list):
            continue

        for group in drop_groups:
            group_chance = float(group.get("chance", 0))
            items = group.get("items", [])

            for item in items:
                item_path = norm_path(item.get("type", ""))
                item_prob = float(item.get("probability", 0))
                if not item_path or item_prob <= 0:
                    continue

                effective = group_chance * item_prob
                if effective <= 0:
                    continue

                item_drops[item_path].append({
                    "droptable_path": table_path,
                    "droptable_name": table_name,
                    "effective_chance": effective,
                })

    # Jetzt verknüpfen mit market_items und Einträge bauen
    for item_path, sources in item_drops.items():
        market_item_id = market_items.get(item_path)
        if not market_item_id:
            skipped += 1
            continue

        matched += 1
        for src in sources:
            entries.append({
                "item_id": market_item_id,
                "source_type": "enemy",
                "relic_unique_name": None,
                "relic_era": None,
                "relic_category": None,
                "relic_name": None,
                "relic_quality": None,
                "relic_manifest": None,
                "droptable_name": src["droptable_name"],
                "droptable_path": src["droptable_path"],
                "rarity": None,
                "drop_chance_intact": None,
                "drop_chance_exceptional": None,
                "drop_chance_flawless": None,
                "drop_chance_radiant": None,
                "drop_chance_enemy": src["effective_chance"],
                "drop_chance_best": src["effective_chance"],
            })

    seen = {}
    for e in entries:
        key = (e["item_id"], e["droptable_path"])
        if key not in seen or e["drop_chance_enemy"] > seen[key]["drop_chance_enemy"]:
            seen[key] = e
    entries = list(seen.values())

    log.info("Enemy Drops: %d Items gematcht, %d ohne Market-Eintrag", matched, skipped)
    return entries


# ──────────────────────────────────────────────
# REWARD DROPS
# ──────────────────────────────────────────────

def build_reward_drops(conn) -> list[dict]:
    """
    Verarbeitet ExportRewards (flache Rows).
    unique_name = "table_path::rotation.stage"
    raw = { type: item_path, probability: float, ... }
    """
    log.info("Lade ExportRewards (flat rows) ...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT unique_name, raw
            FROM wfpe_items
            WHERE export_type = 'ExportRewards'
        """)
        reward_rows = cur.fetchall()

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, game_ref FROM market_items WHERE game_ref IS NOT NULL")
        market_items = {row["game_ref"]: row["id"] for row in cur.fetchall()}

    # item_id + table_path → bestes Entry (höchste Chance über alle Rotationen)
    best: dict[tuple, dict] = {}
    matched = 0
    skipped = 0

    for row in reward_rows:
        raw = row["raw"]
        if not raw:
            continue

        item_path = norm_path(raw.get("type", ""))
        probability = float(raw.get("probability", 0))

        if not item_path or probability <= 0:
            continue

        # "table_path::rotation.stage" → table_path
        table_path = row["unique_name"].split("::")[0]
        table_name = table_path.split("/")[-1]

        market_item_id = market_items.get(item_path)
        if not market_item_id:
            skipped += 1
            continue

        matched += 1
        key = (market_item_id, table_path)
        if key not in best or probability > best[key]["drop_chance_enemy"]:
            best[key] = {
                "item_id": market_item_id,
                "source_type": "mission",
                "relic_unique_name": None,
                "relic_era": None,
                "relic_category": None,
                "relic_name": None,
                "relic_quality": None,
                "relic_manifest": None,
                "droptable_name": table_name,
                "droptable_path": table_path,
                "rarity": raw.get("rarity"),
                "drop_chance_intact": None,
                "drop_chance_exceptional": None,
                "drop_chance_flawless": None,
                "drop_chance_radiant": None,
                "drop_chance_enemy": probability,
                "drop_chance_best": probability,
            }

    entries = list(best.values())
    log.info(
        "Reward Drops: %d Einträge (%d unique Items), %d ohne Market-Eintrag",
        len(entries), len({e["item_id"] for e in entries}), skipped,
    )
    return entries


# ──────────────────────────────────────────────
# WRITE TO DB
# ──────────────────────────────────────────────

def write_drop_sources(conn, entries: list[dict]):
    """Schreibt Einträge in item_drop_sources (TRUNCATE + INSERT)."""
    if not entries:
        log.warning("Keine Einträge zum Schreiben.")
        return

    log.info("Schreibe %d Einträge in item_drop_sources ...", len(entries))

    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE item_drop_sources RESTART IDENTITY CASCADE")

        psycopg2.extras.execute_batch(cur, """
            INSERT INTO item_drop_sources (
                item_id, source_type,
                relic_unique_name, relic_era, relic_category, relic_name, relic_quality, relic_manifest,
                droptable_name, droptable_path,
                rarity,
                drop_chance_intact, drop_chance_exceptional, drop_chance_flawless, drop_chance_radiant,
                drop_chance_enemy, drop_chance_best
            ) VALUES (
                %(item_id)s, %(source_type)s,
                %(relic_unique_name)s, %(relic_era)s, %(relic_category)s, %(relic_name)s,
                %(relic_quality)s, %(relic_manifest)s,
                %(droptable_name)s, %(droptable_path)s,
                %(rarity)s,
                %(drop_chance_intact)s, %(drop_chance_exceptional)s,
                %(drop_chance_flawless)s, %(drop_chance_radiant)s,
                %(drop_chance_enemy)s, %(drop_chance_best)s
            )
        """, entries, page_size=500)

    conn.commit()
    log.info("Fertig. %d Einträge committed.", len(entries))


# ──────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────

def run(conn=None):
    """
    Hauptfunktion. Kann mit einer bestehenden Connection aufgerufen werden
    (z.B. aus dem Sync-Skript), oder öffnet selbst eine wenn conn=None.
    """
    own_conn = conn is None
    if own_conn:
        conn = get_conn()
    try:
        relic_entries = build_relic_drops(conn)
        enemy_entries = build_enemy_drops(conn)
        reward_entries = build_reward_drops(conn)
        all_entries = relic_entries + enemy_entries + reward_entries
        log.info(
            "Gesamt: %d Einträge (%d Relic, %d Enemy, %d Reward/Mission)",
            len(all_entries), len(relic_entries), len(enemy_entries), len(reward_entries),
        )
        write_drop_sources(conn, all_entries)
    except Exception as e:
        conn.rollback()
        log.error("Fehler: %s", e, exc_info=True)
        raise
    finally:
        if own_conn:
            conn.close()


if __name__ == "__main__":
    run()