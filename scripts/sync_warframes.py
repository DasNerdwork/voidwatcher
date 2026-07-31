"""
VoidWatch — Sync: wiki_warframes
============================================================
Holt das Wiki-Datenmodul `Module:Warframes/data` und legt je Warframe die Felder
ab, die der Warframe Public Export NICHT enthält.

Zwei davon sind für die Übersicht unverzichtbar:

  1. DAS WACHSTUM BIS RANG 30. Der Export liefert Rang-0-Werte. Die Regel lautet
     „+100 Leben, +100 Schilde, ±0 Rüstung, +50 Energie" — aber 33 der 117 Frames
     weichen davon ab (Inaros +200 Leben, Hildryn +500 Schilde, Nidus +100
     Rüstung, Grendel gar keine Schilde …). Das Wachstum steckt im Spielclient;
     öffentlich nachgezeichnet ist es nur im Wiki, dort als `HealthRank30`,
     `ShieldRank30`, `ArmorRank30`, `EnergyRank30`.
  2. DIE STARTENERGIE (`InitialEnergy`). Kein fester Anteil der Kapazität: Ash
     startet mit 50 von 150, Baruuk mit 150 von 300, Dante mit 50 von 270.

Dazu die Textfelder für die aufklappbare Detailzeile (Passiv, Fähigkeiten,
Polaritäten, Aura, Helminth-Fähigkeit, Progenitor-Element, Einführung).

WARUM EIN KLAMMERZÄHLER UND KEIN ZEILEN-REGEX
Das Modul wird von Hand gepflegt und schreibt seine Schlüssel in drei Varianten:
`["Ash Prime"] = {`, `["Wisp Prime"]= {` und `['Gauss Prime'] = {`. Ein Regex auf
das Schlüsselmuster verlor daran im Test stumm drei Frames — darunter Grendel
Prime, der eine Sonderregel braucht. Der Scanner unten interessiert sich nur für
Klammertiefen und ist gegen Anführungszeichen und Leerraum immun.

WÄCHTER
Unter MIN_ENTRIES geparsten Einträgen wird NICHT geschrieben. Ein halber Stand
wäre schlimmer als ein alter: die Übersicht zeigt dann Standardwachstum für
Frames, die längst eine Sonderregel haben, und niemand sieht es. Dieselbe Haltung
wie bei den vorberechneten Ranglisten — lieber alt und richtig als frisch und
halb.
"""

import logging
import re
import sys
from pathlib import Path

import psycopg2.extras
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / "api" / ".env")
sys.path.insert(0, str(BASE_DIR.parent))
sys.path.insert(0, str(BASE_DIR))

import api.db as db          # noqa: E402  (erst nach load_dotenv importierbar)
from wfm_http import plain_get  # noqa: E402

log = logging.getLogger(__name__)

MODULE_URL = "https://wiki.warframe.com/index.php?title=Module:Warframes/data&action=raw"

# Untergrenze für den Wächter. Das Modul führt derzeit 124 Warframes; 100 lässt
# Raum für Umbauten am Wiki, ohne einen Totalausfall durchzulassen.
MIN_ENTRIES = 100

# Nur diese Gruppe des Moduls. Archwings, Necramechs und Operators stehen in
# eigenen Gruppen und kommen in der Übersicht nicht vor.
GROUP = "Warframes"

NUM_FIELDS = ("Health", "Shield", "Armor", "Energy", "Sprint", "InitialEnergy",
              "HealthRank30", "ShieldRank30", "ArmorRank30", "EnergyRank30")
TEXT_FIELDS = ("Name", "InternalName", "Passive", "AuraPolarity", "Subsumed",
               "Progenitor", "Introduced", "Type")
LIST_FIELDS = ("Abilities", "Polarities")


# ──────────────────────────────────────────────
# Parser
# ──────────────────────────────────────────────

def _group_body(text: str, group: str) -> str:
    """Inhalt einer Top-Level-Gruppe (`Warframes = { … }`) über Klammertiefe."""
    m = re.search(r"\n\t%s\s*=\s*\{" % re.escape(group), text)
    if not m:
        raise ValueError(f"Gruppe {group!r} nicht im Modul gefunden")
    start = m.end()                      # hinter der öffnenden Klammer
    depth = 1
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start:i]

    # Abgeschnittene Antwort. Kein Abbruch mit Ausnahme: der Rest wird
    # weitergereicht, der Entry-Scanner nimmt daraus nur vollständig geklammerte
    # Blöcke, und über das Schreiben entscheidet dann der Zähler unten. So endet
    # ein halber Download in einer verständlichen Meldung statt in einem
    # Stacktrace — und in beiden Fällen bleibt der alte Stand stehen.
    log.warning("Gruppe %r wird im Modultext nicht geschlossen — Antwort vermutlich "
                "abgeschnitten (%d Zeichen).", group, len(text))
    return text[start:]


def _entry_bodies(group_body: str):
    """
    Alle Einträge einer Gruppe als Rohtext.

    Bewusst ohne Annahme über die Schreibweise des Schlüssels: gesucht wird eine
    öffnende Klammer auf Tiefe 0, der Block endet auf der zugehörigen schließenden.
    Anführungszeichen werden dabei übersprungen, damit eine Klammer in einem
    Beschreibungstext die Zählung nicht verschiebt.
    """
    depth, start, i, n = 0, None, 0, len(group_body)
    while i < n:
        ch = group_body[i]
        if ch == '"' or ch == "'":
            quote, i = ch, i + 1
            while i < n and group_body[i] != quote:
                i += 2 if group_body[i] == "\\" else 1
        elif ch == "{":
            if depth == 0:
                start = i + 1
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                yield group_body[start:i]
                start = None
        i += 1


def _num(body: str, key: str):
    m = re.search(r"[\n\t ]%s\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)" % key, body)
    return float(m.group(1)) if m else None


def _text(body: str, key: str):
    m = re.search(r'[\n\t ]%s\s*=\s*"((?:[^"\\]|\\.)*)"' % key, body)
    return m.group(1).replace('\\"', '"') if m else None


def _list(body: str, key: str):
    m = re.search(r"[\n\t ]%s\s*=\s*\{([^{}]*)\}" % key, body)
    if not m:
        return None
    return [v for v in re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))]


def parse_module(text: str) -> dict:
    """
    {internal_name: payload} für alle Warframes des Moduls.

    Einträge ohne InternalName (Drifter, Operator, Platzhalter) fallen raus — sie
    lassen sich ohnehin nicht mit dem Export verbinden.
    """
    out = {}
    for body in _entry_bodies(_group_body(text, GROUP)):
        internal = _text(body, "InternalName")
        if not internal:
            continue
        payload = {k: _num(body, k) for k in NUM_FIELDS}
        payload.update({k: _text(body, k) for k in TEXT_FIELDS})
        payload.update({k: _list(body, k) for k in LIST_FIELDS})
        payload["IgnoreEntry"] = "_IgnoreEntry" in body
        out[internal] = payload
    return out


# ──────────────────────────────────────────────
# Lauf
# ──────────────────────────────────────────────

def run(conn=None):
    own_conn = conn is None
    if own_conn:
        conn = db.get_conn()

    try:
        resp = plain_get(MODULE_URL, timeout=30)
        resp.raise_for_status()
        entries = parse_module(resp.text)

        if len(entries) < MIN_ENTRIES:
            # Kein Schreibvorgang: der vorhandene Stand bleibt stehen.
            log.error("Wiki-Modul lieferte nur %d Einträge (erwartet ≥ %d) — "
                      "wiki_warframes bleibt unverändert.", len(entries), MIN_ENTRIES)
            return 0

        rows = [(internal, p.get("Name") or internal, psycopg2.extras.Json(p))
                for internal, p in sorted(entries.items())]

        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                INSERT INTO wiki_warframes (internal_name, name, payload)
                VALUES %s
                ON CONFLICT (internal_name) DO UPDATE SET
                    name       = EXCLUDED.name,
                    payload    = EXCLUDED.payload,
                    updated_at = now()
            """, rows, page_size=500)
            cur.execute("DELETE FROM wiki_warframes WHERE internal_name <> ALL(%s)",
                        ([r[0] for r in rows],))

            # Zweiter Wächter: jeder Warframe des Exports OHNE Wiki-Gegenstück
            # wird namentlich genannt. Er verschwindet nicht aus der Übersicht,
            # rechnet dort aber mit Standardwachstum und ohne Startenergie —
            # das gehört ins Protokoll, nicht ins Schweigen.
            cur.execute("""
                SELECT w.name_en
                FROM wfpe_items w
                LEFT JOIN wiki_warframes k ON k.internal_name = w.unique_name
                WHERE w.export_type = 'ExportWarframes'
                  AND w.raw->>'productCategory' = 'Suits'
                  AND k.internal_name IS NULL
                ORDER BY w.name_en
            """)
            orphans = [r[0] for r in cur.fetchall()]
        conn.commit()

        log.info("wiki_warframes: %d Einträge geschrieben.", len(rows))
        if orphans:
            log.warning("Ohne Wiki-Eintrag (Standardwachstum): %s", ", ".join(orphans))
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
