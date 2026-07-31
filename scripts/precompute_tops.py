"""
VoidWatch — Pre-Compute: top_lists
============================================================
Schreibt die fertigen Ranglisten der Startseite in die Tabelle `top_lists`.

Warum überhaupt: ein /api/top-Aufruf baute viermal dieselbe teure edges-CTE über
identische Eingaben. Gemessen vor dieser Änderung — 48 h (die Vorgabe der
Startseite) 1,24 s, 90 T 8,60 s. Die Daten ändern sich einmal täglich, also
gehört das Ergebnis vorberechnet und nicht bei jedem Klick neu ermittelt.

Die Matrix:
    hours   24, 48, 168, 336, 720, 2160        (6)
    tag     NULL, mod, arcane, prime, weapon, relic  (6)
    metric  pct, abs                           (2)
                                        → 72 Kombinationen à 4 Listen

`rank_mode` wird bewusst NICHT variiert: das Frontend sendet ausschließlich die
Vorgabe "max". Andere Werte fallen in der API auf die Live-Berechnung zurück —
72 Kombinationen zu verdreifachen, um einen Pfad abzudecken, den niemand aufruft,
wäre die falsche Rechnung.

Geschrieben wird in EINER Transaktion (DELETE + INSERT). Ein halb gefüllter Stand
darf nie sichtbar werden; die API prüft zusätzlich `source_updated` gegen
metadata.last_updated und rechnet bei Abweichung live.
"""

import logging
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / "api" / ".env")
sys.path.insert(0, str(BASE_DIR.parent))

import api.db as db  # noqa: E402  (erst nach load_dotenv importierbar)

log = logging.getLogger(__name__)

HOURS_OPTIONS = (24, 48, 168, 336, 720, 2160)
TAGS = (None, "mod", "arcane", "prime", "weapon", "relic")
METRICS = ("pct", "abs")
KINDS = ("performer", "loser", "seller", "traded")


def run(conn=None):
    own_conn = conn is None
    if own_conn:
        conn = db.get_conn()

    started = time.monotonic()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT value::timestamptz FROM metadata WHERE key = 'last_updated'")
            row = cur.fetchone()
            if not row or row[0] is None:
                log.warning("Kein last_updated in metadata — Vorberechnung übersprungen.")
                return 0
            source_updated = row[0]

        rows = []
        for hours in HOURS_OPTIONS:
            for tag in TAGS:
                for metric in METRICS:
                    for kind in KINDS:
                        items = db.compute_top_list(
                            kind, hours, db.PRECOMPUTE_DEPTH,
                            tag=tag, rank_mode="max", metric=metric,
                        )
                        for rank, item in enumerate(items, start=1):
                            rows.append((hours, tag, metric, kind, rank,
                                         psycopg2.extras.Json(item), source_updated))
            log.info("  hours=%s fertig (%.1fs, %d Zeilen bisher)",
                     hours, time.monotonic() - started, len(rows))

        with conn.cursor() as cur:
            cur.execute("DELETE FROM top_lists")
            psycopg2.extras.execute_values(cur, """
                INSERT INTO top_lists
                    (hours, tag, metric, list_kind, rank, payload, source_updated)
                VALUES %s
            """, rows, page_size=1000)
        conn.commit()

        log.info("top_lists: %d Zeilen für %d Kombinationen in %.1fs geschrieben.",
                 len(rows), len(HOURS_OPTIONS) * len(TAGS) * len(METRICS), time.monotonic() - started)
        return len(rows)

    except Exception:
        conn.rollback()
        raise
    finally:
        if own_conn:
            conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(levelname)s] %(message)s")
    run()
