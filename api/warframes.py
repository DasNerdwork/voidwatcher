"""
VoidTicker - Warframe-Basiswerte
============================================================
Rechnet die Rang-30-Werte und die abgeleiteten Kennzahlen der Warframe-Übersicht.
Reine Funktionen, kein SQL - die Abfrage steht in `db.get_warframe_rows()`.

DIE ZAHLEN STAMMEN AUS ZWEI QUELLEN
`wfpe_items` liefert die Rang-0-Basiswerte (DEs eigener Export, maßgeblich),
`wiki_warframes` das Wachstum bis Rang 30 und die Startenergie. Beide stimmen bei
allen 117 Frames in den Basiswerten überein; das Wiki ergänzt nur.

DAS WACHSTUM IST NICHT EINHEITLICH
Die Regel lautet +100 Leben, +100 Schilde, ±0 Rüstung, +50 Energie - aber 33 der
117 Frames weichen ab. Deshalb gilt: liegt ein Rang-30-Wert aus dem Wiki vor,
gewinnt er; sonst greift die Regel. Wer stattdessen nur die Regel anwendet,
bekommt Inaros mit 2210 statt 2310 Leben, Hildryn mit 1380 statt 1780 Schilden
und Dante mit 400/250/250 statt 390/240/270.

BASISWERT NULL BLEIBT NULL
Inaros, Nidus und Kullervo haben keine Schilde, Hildryn und Lavos keine Energie.
Wächst so ein Wert mit, entstehen Zahlen, die es im Spiel nicht gibt - und über
die Überschilde reißt es zusätzlich 1200 Punkte in die EHP-Spalten. Genau dieser
Fehler steckte in der abgelösten Google-Tabelle, weil sie erst wachsen ließ und
danach auf Null prüfte.

DER ÜBERSCHILD-SONDERFALL HÄNGT AM PFAD, NICHT AM NAMEN
Harrow und Harrow Prime tragen 2400 statt 1200. Erkannt werden sie an
`/Lotus/Powersuits/Priest/`, nicht an der Zeichenkette „Harrow": ein künftiger
„Harrow Umbra" hätte denselben Pfad, eine umbenannte Lokalisierung nicht.
"""

import statistics

# Wachstum von Rang 0 auf Rang 30, wenn das Wiki keinen abweichenden Wert nennt.
DEFAULT_GROWTH = {"health": 100, "shield": 100, "armor": 0, "energy": 50}

# Rüstungsformel des Spiels: Schadensreduktion = armor / (armor + 300),
# Überlebensfaktor = 1 + armor/300. DE hat die Konstante schon einmal geändert,
# deshalb steht sie hier und nicht in den Formeln.
ARMOR_K = 300

OVERSHIELD_DEFAULT = 1200
OVERSHIELD_PRIEST = 2400
PRIEST_PATH = "/Lotus/Powersuits/Priest/"

# Spalten, über die die Medianzeile gebildet wird - dieselbe Reihenfolge wie in
# der Tabelle. `name` und die Textfelder der Detailzeile bleiben außen vor.
NUMERIC_KEYS = (
    "health", "armor", "dr_pct", "effective_health", "shield",
    "energy", "start_energy", "sprint", "max_overshield",
    "ehp_shield", "ehp_shield_overshield",
)

# Wiki-Feld → interner Schlüssel für die Rang-30-Überschreibung
_RANK30_FIELDS = {
    "health": ("HealthRank30", "Health"),
    "shield": ("ShieldRank30", "Shield"),
    "armor":  ("ArmorRank30",  "Armor"),
    "energy": ("EnergyRank30", "Energy"),
}


def _f(v):
    """Zahl aus JSONB/NUMERIC, sonst None. `Decimal` und `str` kommen beide vor."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _rank30(key: str, base: float, wiki: dict, name: str, warn: list) -> float:
    """
    Rang-30-Wert einer Spalte.

    Der Wiki-Wert wird nur übernommen, wenn sein Basiswert mit dem Export
    übereinstimmt. Weicht er ab, ist das Wiki veraltet - dann ist auch sein
    Rang-30-Wert nicht vertrauenswürdig, und die Regel ist die bessere Schätzung.
    """
    if base == 0:
        return 0.0                       # Basiswert Null wächst nicht mit

    field, base_field = _RANK30_FIELDS[key]
    wiki_r30 = _f(wiki.get(field))
    if wiki_r30 is not None:
        wiki_base = _f(wiki.get(base_field))
        if wiki_base is None or wiki_base == base:
            return wiki_r30
        warn.append(f"{name}: Wiki-Basiswert {key} {wiki_base} ≠ Export {base}")

    return base + DEFAULT_GROWTH[key]


def build_row(row: dict, warn: list) -> dict:
    """Eine Zeile der Übersicht aus einer DB-Zeile (siehe db.get_warframe_rows)."""
    raw = row.get("raw") or {}
    wiki = row.get("payload") or {}
    name = row.get("name_en") or wiki.get("Name") or row["unique_name"]

    base = {
        "health": _f(raw.get("health")) or 0.0,
        "shield": _f(raw.get("shield")) or 0.0,
        "armor":  _f(raw.get("armor"))  or 0.0,
        "energy": _f(raw.get("power"))  or 0.0,
    }
    r30 = {k: _rank30(k, v, wiki, name, warn) for k, v in base.items()}

    health, shield, armor, energy = r30["health"], r30["shield"], r30["armor"], r30["energy"]

    if shield == 0:
        overshield = 0.0
    elif row["unique_name"].startswith(PRIEST_PATH):
        overshield = float(OVERSHIELD_PRIEST)
    else:
        overshield = float(OVERSHIELD_DEFAULT)

    effective_health = health * (1 + armor / ARMOR_K)
    ehp_shield = effective_health + shield

    # Startenergie: eigener Wert je Frame, KEIN Anteil der Kapazität. Fehlt der
    # Wiki-Eintrag, bleibt die Zelle leer - eine geschätzte Zahl sähe aus wie eine
    # gemessene.
    start_energy = _f(wiki.get("InitialEnergy"))

    return {
        "name": name,
        "unique_name": row["unique_name"],
        "is_prime": name.endswith(" Prime"),
        # Kennzahlen
        "health": round(health, 2),
        "armor": round(armor, 2),
        "dr_pct": round(armor / (armor + ARMOR_K) * 100, 2),
        "effective_health": round(effective_health, 2),
        "shield": round(shield, 2),
        "energy": round(energy, 2),
        "start_energy": None if start_energy is None else round(start_energy, 2),
        "sprint": round(_f(raw.get("sprintSpeed")) or 0.0, 2),
        "max_overshield": overshield,
        "ehp_shield": round(ehp_shield, 2),
        "ehp_shield_overshield": round(ehp_shield + overshield, 2),
        # Detailzeile
        "passive": wiki.get("Passive"),
        "abilities": wiki.get("Abilities") or [],
        "polarities": wiki.get("Polarities") or [],
        "aura": wiki.get("AuraPolarity"),
        "helminth": wiki.get("Subsumed"),
        "progenitor": wiki.get("Progenitor"),
        "introduced": wiki.get("Introduced"),
        # Marktbezug (nur Prime-Sets haben ein Handelsobjekt)
        "slug": row.get("slug"),
        "thumb_path": row.get("thumb_path"),
        "price": _f(row.get("price")),
        "price_is_offer": bool(row.get("price_is_offer")),
    }


def medians(rows: list) -> dict:
    """
    Spaltenweiser Median über eine Zeilenmenge.

    Spaltenweise heißt: die Zeile beschreibt keinen existierenden Warframe - ihre
    EHP-Zahl lässt sich nicht aus ihrer Leben- und Rüstungszahl nachrechnen. Sie
    ist ein Vergleichsmaßstab, und die Oberfläche muss das auch so benennen.

    Median statt Mittelwert, weil Inaros (Leben) und Hildryn (Schilde) jeden
    Durchschnitt verziehen.
    """
    out = {}
    for key in NUMERIC_KEYS:
        vals = [r[key] for r in rows if r.get(key) is not None]
        out[key] = round(statistics.median(vals), 2) if vals else None
    return out


def _family(unique_name: str) -> str:
    """`/Lotus/Powersuits/Ninja/AshPrime` → `/Lotus/Powersuits/Ninja/`"""
    return unique_name.rsplit("/", 1)[0] + "/"


def _inherit_helminth(items: list) -> None:
    """
    Helminth-Fähigkeit von der Grundform auf ihre Varianten übertragen.

    Das Wiki führt `Subsumed` nur beim Grundframe; 42 der 51 Primes und Excalibur
    Umbra stünden sonst leer da, obwohl im Spiel dieselbe Fähigkeit abgelegt wird.
    Verbunden wird über den Pfad, nicht über den Namen - „Ash" und „Ash Prime"
    teilen sich `/Lotus/Powersuits/Ninja/`.
    """
    known = {_family(r["unique_name"]): r["helminth"]
             for r in items if r["helminth"]}
    for r in items:
        if not r["helminth"]:
            r["helminth"] = known.get(_family(r["unique_name"]))


def build_table(db_rows: list) -> dict:
    """
    Fertige Antwort für /api/warframes.

    Drei Median-Sätze, weil die Oberfläche zwischen allen Frames, nur Prime und
    nur Nicht-Prime umschaltet: ein Prime-Set ist durchweg besser ausgestattet,
    und ein gemeinsamer Median vergliche es mit den Nicht-Primes statt mit
    seinesgleichen.
    """
    warn: list = []
    items = sorted((build_row(r, warn) for r in db_rows), key=lambda r: r["name"])
    _inherit_helminth(items)
    primes = [r for r in items if r["is_prime"]]
    others = [r for r in items if not r["is_prime"]]

    return {
        "items": items,
        "medians": {
            "all": medians(items),
            "prime": medians(primes),
            "nonprime": medians(others),
        },
        "warnings": warn,
    }
