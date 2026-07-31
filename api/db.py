import datetime as _dt
import decimal as _dec
import os
import threading
from pathlib import Path

import psycopg2
import psycopg2.extras
import psycopg2.pool
from dotenv import load_dotenv

# Pfad explizit: ohne ihn löst python-dotenv relativ zum aufrufenden Frame auf.
# Unter uvicorn ging das gut, ein `python -c "import api.db"` von anderswo
# bekam dagegen lautlos leere VW_*-Variablen und psycopg2 verband sich mit der
# Datenbank `root` über den Unix-Socket, statt verständlich zu scheitern.
load_dotenv(Path(__file__).resolve().parent / ".env")


# ──────────────────────────────────────────────
# VERBINDUNGEN
# ──────────────────────────────────────────────
# Vorher öffnete jede query() eine eigene Verbindung und schloss sie wieder —
# gemessen 8,5 ms je Verbindungsaufbau, bei fünf Abfragen pro /api/top also rund
# 43 ms allein für Handshakes. Schlimmer als die Latenz ist die Obergrenze: der
# Server erlaubt 100 gleichzeitige Verbindungen, und uvicorn bedient synchrone
# Endpunkte aus einem 40er-Threadpool.
_POOL = None
_POOL_LOCK = threading.Lock()


def _pool():
    global _POOL
    if _POOL is None:
        with _POOL_LOCK:
            if _POOL is None:
                _POOL = psycopg2.pool.ThreadedConnectionPool(
                    minconn=1, maxconn=12,
                    host=os.getenv("VW_HOST"),
                    port=os.getenv("VW_PORT"),
                    user=os.getenv("VW_USER"),
                    password=os.getenv("VW_PASSWORD"),
                    dbname=os.getenv("VW_NAME"),
                )
    return _POOL


def get_conn():
    """Einzelverbindung ohne Pool — für Skripte, die den Prozess ohnehin beenden."""
    return psycopg2.connect(
        host=os.getenv("VW_HOST"),
        port=os.getenv("VW_PORT"),
        user=os.getenv("VW_USER"),
        password=os.getenv("VW_PASSWORD"),
        dbname=os.getenv("VW_NAME"),
    )


def query(sql, params=None):
    pool = _pool()
    conn = pool.getconn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or ())
            return cur.fetchall()
    except Exception:
        # Eine Verbindung mit abgebrochener Transaktion darf nicht in den Pool
        # zurück — der nächste Nutzer bekäme sonst "current transaction is
        # aborted" für eine völlig andere Abfrage.
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def _jsonable(rows: list) -> list:
    """
    RealDictRow → reines dict mit JSON-tauglichen Werten.

    Liegt hier und nicht in main.py, damit die vorberechneten Ranglisten exakt
    dieselbe Form haben wie die live berechneten. Wären es zwei Umwandlungen,
    unterschieden sich Cache und Rückfall früher oder später in Details.
    """
    out = []
    for r in rows:
        d = dict(r)
        for k, v in d.items():
            if isinstance(v, _dec.Decimal):
                d[k] = float(v)
            elif isinstance(v, (_dt.datetime, _dt.date)):
                d[k] = v.isoformat()
        out.append(d)
    return out


def get_last_updated():
    row = query("SELECT value FROM metadata WHERE key = 'last_updated'")
    return row[0]["value"] if row else None


# ──────────────────────────────────────────────
# HILFSFUNKTIONEN
# ──────────────────────────────────────────────

# Kategoriefilter für die Oberfläche.
#
# Ein reiner "Tag ist enthalten"-Test reichte nicht und war an drei Stellen falsch:
#   • 'arcane'   existiert im Tag-Vokabular gar nicht → Kategorie war immer leer.
#                Richtig ist 'arcane_enhancement'.
#   • 'warframe' bedeutet "gehört zu Warframes", nicht "ist ein Warframe": von 604
#                Items sind 354 Mods und 251 Prime-Teile, echte Warframes: keine.
#                Die Kategorie ist deshalb ersatzlos entfallen.
#   • 'weapon'   enthält zu 471/769 Prime-Teile. Für die Kategorie WEAPONS sind
#                nur die Nicht-Prime-Waffen gemeint → braucht eine Negation.
#
# Abgefragt wird die Spalte i.tags statt (i.raw->>'tags')::jsonb — inhaltlich
# identisch (geprüft: 0 Abweichungen), aber nur die Spalte nutzt den GIN-Index
# idx_market_items_tags.
_CATEGORY_FILTERS: dict[str, str] = {
    "mod":    "AND i.tags ? 'mod'",
    "arcane": "AND i.tags ? 'arcane_enhancement'",
    "prime":  "AND i.tags ? 'prime'",
    "weapon": "AND i.tags ? 'weapon' AND NOT i.tags ? 'prime'",
    "relic":  "AND i.tags ? 'relic'",
}


def _tag_filter(tag: str | None) -> tuple[str, list]:
    """
    SQL-Bedingung für eine Kategorie. Unbekannte Werte (z.B. 'warframe' oder
    'resource' aus einem alten Lesezeichen) filtern bewusst NICHT, statt eine
    leere Liste zu liefern — eine unbekannte Kategorie soll nicht wie
    "nichts gefunden" aussehen.
    """
    if not tag:
        return "", []
    return _CATEGORY_FILTERS.get(tag, ""), []


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


# ── Datenqualität ─────────────────────────────────────────────────────────────
# warframe.market-Daten sind Nutzerangaben, keine Ingame-Trades. Zwei getrennte
# Probleme, deshalb zwei Verfahren:
#
#   1. UNMÖGLICHE PREISE — "Warm Coat" für 500.067 ₱ bei einem Median von 10 ₱.
#      Lässt sich nicht über das Volumen abfangen (dieser Eintrag hatte Volumen 35),
#      wohl aber über den Abstand zum eigenen Median des Items.
#   2. ZU DÜNNE DATENLAGE — drei Trades von 5 auf 85 ₱ sind kein Markttrend.
#      Lässt sich nicht über Preisgrenzen abfangen, wohl aber über eine
#      Glaubwürdigkeitsgewichtung.

# 99 % aller Beobachtungen liegen unter dem 4,8-fachen ihres Item-Medians,
# 99,9 % unter dem 15-fachen. Bei 20× bleiben 81 von 285.461 Zeilen übrig —
# darunter alle zwölf Einträge über 5.000 ₱. Echte Ereignisse wie ein
# Prime-Unvaulting bewegen sich im einstelligen Faktor und bleiben unberührt.
PLAUSIBILITY_FACTOR = 20

# Glaubwürdigkeit v/(v+m). Wirkt NUR auf die Sortierung — angezeigt wird immer
# der echte Wert.
#
#   Trades      m=10 (alt)   m=30 (jetzt)
#       20         0,67          0,40
#      100         0,91          0,77
#     2000         1,00          0,99
#
# Von 10 auf 30 angehoben: bei m=10 lagen 20 und 2000 Trades nur um den Faktor
# 1,5 auseinander, was dem Volumen zu wenig Gewicht gab. Jetzt 2,5.
CREDIBILITY_M = 30

# Mindestvolumen für die Ranglisten. Von 2 angehoben; 1757 der 2398 gehandelten
# Items bleiben damit sichtbar.
MIN_VOLUME = 5

# Mindest-Handelsvolumen je Rand der Veränderungsmessung (siehe _edge_cte).
#
# Vorher war ein Rand genau EIN Bucket. Gemessen über alle ranglistenrelevanten
# Items bei 48h liegt dessen Volumen im Median bei 1 Trade, und 79,7 % der Items
# haben mindestens einen Rand mit ≤ 2 Trades. Daraus entstanden Werte wie
# "Adarza Kavat Imprint +900 %": ein einzelner 1-₱-Eintrag mit 2 Trades bei einem
# Item-Median von 9,5 ₱ diente als Nenner.
#
# Derselbe Wert wie MIN_VOLUME, aus demselben Grund: unterhalb von fünf Trades
# ist eine Preisangabe kein Marktpreis, sondern die Meinung einer einzelnen Person.
EDGE_MIN_VOLUME = 5

# Untergrenze NUR für den Prozent-Modus. Bei Cent-Items ist die prozentuale
# Veränderung reines Rauschen: "Requiem I Relic" ging von 0,22 auf 0,67 ₱ —
# rechnerisch +203 %, tatsächlich 0,45 Platin. 79 von 2346 gehandelten Items
# liegen unter 2 ₱ und erzeugen systematisch solche Ausschläge.
# Im absoluten Modus braucht es die Grenze nicht: dort fällt ein Cent-Item
# mangels nennenswerter Differenz von selbst durch.
MIN_PRICE_FOR_PCT = 2


def _metric_parts(metric: str) -> tuple[str, str]:
    """
    (Sortier-Ausdruck, Zusatzbedingung fürs HAVING) je nach Metrik.

    "pct" ordnet nach prozentualer Veränderung und blendet Cent-Items aus,
    "abs" nach der Platin-Differenz — dort ist die Untergrenze überflüssig,
    weil ein 1-₱-Item ohnehin keine nennenswerte Differenz erzeugt.
    """
    change_pct = "ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1)"
    change_abs = "ROUND((c.price - p.price)::numeric, 2)"
    if metric == "abs":
        return change_abs, ""
    # Die Grenze gehört auf den NENNER, nicht auf den Fenster-Durchschnitt.
    # Vorher stand hier AVG(s.avg_price) — daran scheiterte der Zweck: "Adarza
    # Kavat Imprint" hat 9,4 ₱ Durchschnitt und passierte die Grenze mühelos,
    # geteilt wurde aber durch 1,00 ₱. Genau diese Division erzeugt die
    # dreistelligen Prozentwerte, also muss sie geprüft werden.
    #
    # Der Fenster-Durchschnitt bleibt zusätzlich stehen: er fängt Items ab, deren
    # Nenner knapp über der Grenze liegt, während der ausgewiesene Preis darunter
    # bleibt (z.B. Meso X1 Relic mit 1,5 ₱).
    return change_pct, (
        f" AND AVG(s.avg_price) >= {MIN_PRICE_FOR_PCT}"
        f" AND p.price >= {MIN_PRICE_FOR_PCT}"
    )


def _window_48h(hours: float) -> str:
    """
    Fenster der Stunden-Tabelle, verankert am jüngsten Datenpunkt statt an NOW().

    Der Anker ist nicht kosmetisch. Er stand zwar in _edge_cte schon richtig, das
    äußere SELECT derselben Abfragen rechnete aber mit NOW() — Kachel und
    Prozentwert beschrieben damit verschiedene Zeiträume. Sichtbar wurde das als
    „Adarza Kavat Imprint: +900 %" neben „Preisspanne 8–13 ₱": der 1-₱-Bucket,
    der den Prozentwert erzeugte, lag im Fenster der Kennzahl und außerhalb dem
    der Kachel. Zusätzlich wanderte die Kachel minütlich, die Kennzahl nur beim
    Sync.
    """
    return f"s.ts >= (SELECT MAX(ts) FROM market_stats_48h) - INTERVAL '{hours} hours'"


def _window_90d(days: int) -> str:
    """Tages-Variante von _window_48h, gleiche Begründung."""
    return (f"s.day >= ((SELECT MAX(day) FROM market_stats_90d)"
            f" - INTERVAL '{days} days')::date")


def _plausible_clause() -> str:
    """
    Schließt Preise aus, die zu weit vom Median des Items entfernt liegen.

    price_median IS NULL bedeutet "keine Referenz" (neues Item ohne Historie) —
    dann greift der Filter bewusst nicht: unbekannt ist nicht manipuliert.
    """
    return f"""AND (i.price_median IS NULL
                    OR s.avg_price <= i.price_median * {PLAUSIBILITY_FACTOR})"""


def _credibility(volume_expr: str = "SUM(s.volume)") -> str:
    """Shrinkage-Faktor 0…1 aus dem Handelsvolumen."""
    return f"({volume_expr}::numeric / ({volume_expr} + {CREDIBILITY_M}))"


# Ab diesem Handelsvolumen gilt eine Platin-Differenz als voll belastbar.
# Siehe _sort_weight — bewusst niedrig, weil im Platin-Modus die Differenz selbst
# schon aussagt, worum es geht.
ABS_FULL_TRUST_VOLUME = 20


def _sort_weight(metric: str) -> str:
    """
    Gewicht, mit dem die Metrik für die SORTIERUNG multipliziert wird.

    Die beiden Modi brauchen unterschiedliche Gewichte, weil sie unterschiedlich
    anfällig sind:

    "pct" behält die volle Shrinkage v/(v+30). Ein Prozentwert entsteht aus einer
    Division und explodiert bei kleinem Nenner — dort ist die Dämpfung über den
    gesamten Volumenbereich sinnvoll.

    "abs" wird dagegen primär nach der Differenz selbst sortiert. Eine
    Platin-Differenz von 23 ₱ ist eine Aussage über den Markt, egal ob sie auf 33
    oder auf 175 Trades beruht — die volle Shrinkage drehte genau das um und
    schob 23,41 ₱ (33 Trades) hinter 14,93 ₱ (171 Trades). Eine Liste, deren
    sichtbare Zahlen nicht fallen, liest sich als kaputt.

    Bleibt der Schutz gegen das, was die Glaubwürdigkeit eigentlich abwehren
    soll: eine Handvoll Fantasiepreise. Dafür genügt ein Gewicht, das bei
    ABS_FULL_TRUST_VOLUME sättigt — darüber ordnet es nichts mehr um, darunter
    dämpft es (10 Trades → 0,5). Zusammen mit MIN_VOLUME und EDGE_MIN_VOLUME
    schafft es ein einzelner Trade ohnehin nicht in die Liste.
    """
    if metric == "abs":
        return f"LEAST(1.0, SUM(s.volume)::numeric / {ABS_FULL_TRUST_VOLUME})"
    return _credibility()


# ──────────────────────────────────────────────
# ITEM-NAMEN, ZWEISPRACHIG
# ──────────────────────────────────────────────
# warframe.market liefert seine Items zweisprachig, sobald der Sync `Language: de`
# schickt (siehe scripts/sync_api.py und migrations/010). Beide Namen liegen damit
# in derselben Zeile.
#
# Jede Abfrage gibt BEIDE Namen zurück, statt einen `?lang=`-Parameter
# durchzureichen. Drei Gründe: die Oberfläche schaltet ohne neuen Abruf um, die
# vorberechneten Ranglisten in `top_lists` brauchen keine zweite Fassung je
# Sprache, und ein Sprachwechsel kann keine halb gefüllten Caches erzeugen.
#
# Der deutsche Zweig fehlt, solange ein Item noch nicht neu gesynct wurde —
# deshalb überall NULLIF/COALESCE, damit ein leerer Name auf Englisch zurückfällt
# statt eine leere Zelle zu erzeugen.

def _name_en(alias: str = "i") -> str:
    return f"({alias}.raw->'i18n'->'en'->>'name')"


def _name_de(alias: str = "i") -> str:
    return (f"COALESCE(NULLIF({alias}.raw->'i18n'->'de'->>'name', ''), "
            f"{alias}.raw->'i18n'->'en'->>'name')")


def _vw_avg(col: str) -> str:
    """
    Volumengewichtetes Mittel einer Preisspalte über die Zeilen eines Buckets.

    Ein Bucket kann mehrere Zeilen enthalten (eine je mod_rank). Gewichtet wird
    mit GREATEST(volume, 1), damit Buckets mit volume=0 nicht rausfallen.
    Die CASE-Konstruktion im Nenner zählt nur Zeilen mit, in denen die Spalte
    auch gefüllt ist — sonst würde ein einzelnes NULL das Mittel nach unten ziehen.
    """
    return f"""ROUND(
                (SUM({col} * GREATEST(s.volume, 1))
                 / NULLIF(SUM(CASE WHEN {col} IS NULL THEN 0 ELSE GREATEST(s.volume, 1) END), 0)
                )::numeric, 2)"""


# Was `median` in den Ranglisten genau ist — die Unterscheidung ist wichtig, bevor
# jemand die Zahl anders beschriftet:
#
# warframe.market liefert je Bucket den Median der TATSÄCHLICHEN Trades dieses
# Buckets. `_vw_avg('s.median')` mittelt diese Bucket-Mediane volumengewichtet über
# das Fenster. Das ist ein Mittel von Medianen, KEIN Quantil über alle Einzeltrades
# — die Oberfläche darf deshalb nicht „Hälfte der Trades darunter" behaupten. Sie
# sagt „typischer Preis", und das trifft zu.
#
# Warum trotzdem so: dieselbe Aggregation nutzt get_item_history (siehe unten), die
# Kachel zeigt damit exakt die Größe, die der Graph als Median-Linie zeichnet. Ein
# eigenes percentile_disc über die Buckets wäre zwar ein echter Median, ergäbe aber
# eine andere Zahl als die Linie daneben — genau der Widerspruch, den die
# Datenqualitäts-Regeln oben vermeiden wollen.


def _edge_cte(table: str, bucket: str, window: str, rank_mode: str) -> str:
    """
    Erster und letzter Punkt eines Items im Zeitfenster — genau die beiden Enden
    der Linie, die ItemChart zeichnet.

    Vorgänger war ein Hälften-Vergleich (zweite Hälfte des Zeitraums gegen die
    erste, beide volumengewichtet). Rechnerisch robuster, aber im Bild nirgends
    nachvollziehbar: Meso E1 Relic lief über 7 Tage von 20 auf 70 ₱ und die
    Kennzahl meldete +33, weil sie 68,75 (2. Hälfte) gegen 36 (1. Hälfte) stellte.
    Daneben stand zugleich „Eröffnung 20 ₱" — Eröffnung 20, aktuell 70,
    Veränderung +33 ergibt zusammen keinen Sinn.

    Ein Rand ist deshalb NICHT ein einzelner Bucket, sondern so viele Buckets,
    bis EDGE_MIN_VOLUME Trades zusammenkommen — volumengewichtet gemittelt. Der
    frühere Einzel-Bucket war im Median ein einziger Trade; „Adarza Kavat
    Imprint" meldete +900 %, weil ein 1-₱-Eintrag mit 2 Trades den Nenner
    stellte (Item-Median 9,5 ₱). Mit fünf Trades je Rand ergibt derselbe Fall
    +6,5 %, während ein echter 20×-Anstieg mit belegten Rändern stehen bleibt.

    Im Graphen ablesbar bleibt die Kennzahl trotzdem: es ist weiterhin Anfang
    gegen Ende der gezeichneten Linie, nur ein kurzes Stück davon statt eines
    einzelnen Punktes. Das unterscheidet sie vom verworfenen Hälften-Vergleich,
    der zwei Fensterhälften gegeneinander stellte.

    Reicht das Fenster nicht für zwei GETRENNTE Ränder, überdeckt derselbe
    Bucket beide Seiten. Dann bleibt die Vorperiode NULL — der Vergleich stellte
    die Daten sonst sich selbst gegenüber und meldete „0 %", also eine Aussage,
    wo keine ist. Ebenso bei nur einem Bucket im Fenster: „keine
    Vergleichsbasis" ist etwas anderes als „unverändert".

    `vol` bleibt bewusst das Volumen des EINZELNEN Randbuckets, nicht das des
    Rand-Aggregats: es speist die Volumen-Entwicklung der Ansicht
    „Meistgehandelt". Über das Aggregat gerechnet lägen beide Seiten bauartbedingt
    bei je ~EDGE_MIN_VOLUME Trades und die Volumen-Veränderung wäre immer ≈ 0.

    Die Bucket-Preise entstehen über _vw_avg, also identisch zu get_item_history:
    ein Tag/eine Stunde kann mehrere Zeilen haben (eine je mod_rank).
    """
    rank_clause = _rank_clause(rank_mode)
    # „cum - vol < EDGE_MIN_VOLUME" heißt: alles, was VOR diesem Bucket lag, hat
    # die Schwelle noch nicht erreicht. Der Bucket, der sie überschreitet, ist
    # damit gerade noch enthalten — sonst bliebe der Rand unter der Schwelle.
    lead = f"cum_a - vol < {EDGE_MIN_VOLUME}"
    tail = f"cum_z - vol < {EDGE_MIN_VOLUME}"
    return f"""
        buckets AS (
            SELECT s.item_id, {bucket} AS b,
                   {_vw_avg('s.avg_price')} AS price,
                   SUM(s.volume)            AS vol
            FROM {table} s
            JOIN market_items i ON i.id = s.item_id
            WHERE {window}
              {rank_clause}
              {_plausible_clause()}
            GROUP BY s.item_id, {bucket}
        ),
        ranked AS (
            SELECT item_id, b, price, vol,
                   SUM(vol) OVER (PARTITION BY item_id ORDER BY b)      AS cum_a,
                   SUM(vol) OVER (PARTITION BY item_id ORDER BY b DESC) AS cum_z
            FROM buckets
        ),
        edges AS (
            SELECT item_id,
                   -- Randpreise: volumengewichtetes Mittel der jeweiligen Buckets
                   SUM(price * vol) FILTER (WHERE {tail})
                     / NULLIF(SUM(vol) FILTER (WHERE {tail}), 0)        AS c_price,
                   -- Volumen weiterhin aus dem einzelnen Randbucket, siehe Docstring
                   (array_agg(vol ORDER BY b DESC))[1]                  AS c_vol,
                   CASE WHEN COUNT(*) FILTER (WHERE {lead} AND {tail}) = 0
                        THEN SUM(price * vol) FILTER (WHERE {lead})
                             / NULLIF(SUM(vol) FILTER (WHERE {lead}), 0)
                   END                                                  AS p_price,
                   CASE WHEN COUNT(*) FILTER (WHERE {lead} AND {tail}) = 0
                        THEN (array_agg(vol ORDER BY b))[1]
                   END                                                  AS p_vol
            FROM ranked
            GROUP BY item_id
        ),
        current_price  AS (SELECT item_id, ROUND(c_price::numeric, 2) AS price, c_vol AS vol FROM edges),
        previous_price AS (SELECT item_id, ROUND(p_price::numeric, 2) AS price, p_vol AS vol FROM edges)
    """


def _change_pct_cte(hours: float, rank_mode: str = "max") -> str:
    """Stündliche Variante. Fenster ab dem jüngsten Datenpunkt, nicht ab NOW() —
    sonst wandert bei stehendem Sync das Fenster von den Daten weg. Dasselbe
    _window_48h nutzt das äußere SELECT, damit Kennzahl und Kacheln denselben
    Zeitraum beschreiben."""
    return _edge_cte(
        table="market_stats_48h",
        bucket="s.ts",
        window=_window_48h(hours),
        rank_mode=rank_mode,
    )


def _change_pct_cte_90d(days: int, rank_mode: str = "max") -> str:
    """Tages-Variante von _change_pct_cte, gleiche Semantik."""
    return _edge_cte(
        table="market_stats_90d",
        bucket="s.day",
        window=_window_90d(days),
        rank_mode=rank_mode,
    )


def _top_query_90d(days: int, tag_clause: str, rank_clause: str,
                   order_by: str, tag_params: list, limit: int,
                   having: str = f"HAVING SUM(s.volume) >= {MIN_VOLUME}",
                   rank_mode: str = "max", metric: str = "pct") -> list:
    # Sortier-Basis ist der glaubwürdigkeitsgewichtete Score. Die Kennzahlen selbst
    # werden unverändert zurückgegeben — nur die Reihenfolge ändert sich.
    # Shrinkage v/(v+m) statt LN(volume+1): auf 0…1 begrenzt, schwächt dünne
    # Einträge ab, statt sie zusätzlich zu verstärken.
    metric_expr, metric_having = _metric_parts(metric)
    if "change" in order_by:
        direction = "DESC" if "DESC" in order_by else "ASC"
        effective_order = f"({metric_expr} * {_sort_weight(metric)}) {direction} NULLS LAST"
        if metric_having and metric_having not in having:
            having = (having or "HAVING TRUE") + metric_having
    else:
        effective_order = order_by
    return query(f"""
        WITH {_change_pct_cte_90d(days, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')  AS item_name_de,
            i.slug,
            (SELECT MAX(day) FROM market_stats_90d)::timestamptz AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            {_vw_avg('s.median')}            AS median,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_90d s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_90d(days)}
          {tag_clause}
          {rank_clause}
          {_plausible_clause()}
        GROUP BY i.id, i.slug, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol, i.max_rank
        {having}
        -- i.slug als Tiebreaker: bei Gleichstand (haeufig, etwa zwei Items mit
        -- identischem Volumen) gibt Postgres sonst keine feste Reihenfolge. Live-
        -- Abfrage und Vorberechnung sortierten dadurch unterschiedlich, und die
        -- Liste sprang zwischen zwei Aufrufen ohne jede Datenaenderung.
        ORDER BY {effective_order}, i.slug
        LIMIT %s
    """, tag_params + [limit])


# ──────────────────────────────────────────────
# TOP-LISTEN
# ──────────────────────────────────────────────

def get_top_performers(hours, limit, tag: str | None = None, rank_mode: str = "max",
                       metric: str = "pct"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)
    metric_expr, metric_having = _metric_parts(metric)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            rank_mode=rank_mode, metric=metric,
            order_by="change DESC NULLS LAST", tag_params=tag_params, limit=limit,
        )

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')  AS item_name_de,
            i.slug,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            {_vw_avg('s.median')}            AS median,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause}
          {rank_clause}
          {_plausible_clause()}
        GROUP BY i.id, i.slug, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol, i.max_rank
        HAVING SUM(s.volume) >= {MIN_VOLUME}{metric_having}
        ORDER BY ({metric_expr} * {_sort_weight(metric)}) DESC NULLS LAST, i.slug
        LIMIT %s
    """, tag_params + [limit])


def get_top_losers(hours, limit, tag: str | None = None, rank_mode: str = "max",
                   metric: str = "pct"):
    """
    Spiegelbild zu get_top_performers: Items mit dem stärksten Preisverfall.

    Die Dashboard-Karte "Verlierer" zog ihre Daten bisher aus top_performer und
    nahm daraus den schwächsten Eintrag — bei steigendem Markt also einen Gewinner.
    Echte Verlierer gibt es reichlich (792 Items im Minus über 24h), sie wurden
    nur nie abgefragt.

    Zwei Unterschiede zu get_top_performers:
      • ASC statt DESC auf demselben volumengewichteten Score. Die Gewichtung
        wirkt hier genauso richtig: ein stark gehandelter Verlierer rangiert vor
        einem Einzeltrade mit -90%.
      • HAVING ... change_pct < 0, damit bei reinem Aufwärtsmarkt lieber eine
        leere Liste zurückkommt, als Gewinner als Verlierer auszugeben.
    """
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)
    change_expr, metric_having = _metric_parts(metric)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            rank_mode=rank_mode, metric=metric,
            order_by="change ASC NULLS LAST", tag_params=tag_params, limit=limit,
            having=f"HAVING SUM(s.volume) >= {MIN_VOLUME} AND {change_expr} < 0",
        )

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')  AS item_name_de,
            i.slug,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            {_vw_avg('s.median')}            AS median,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause}
          {rank_clause}
          {_plausible_clause()}
        GROUP BY i.id, i.slug, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol, i.max_rank
        HAVING SUM(s.volume) >= {MIN_VOLUME}{metric_having} AND {change_expr} < 0
        ORDER BY ({change_expr} * {_sort_weight(metric)}) ASC NULLS LAST, i.slug
        LIMIT %s
    """, tag_params + [limit])


def get_top_sellers(hours, limit, tag: str | None = None, rank_mode: str = "max"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            rank_mode=rank_mode,
            order_by="c.price DESC", tag_params=tag_params, limit=limit, having="",
        )

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')  AS item_name_de,
            i.slug,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            {_vw_avg('s.median')}            AS median,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause}
          {rank_clause}
          {_plausible_clause()}
        GROUP BY i.id, i.slug, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol, i.max_rank
        ORDER BY c.price DESC, i.slug
        LIMIT %s
    """, tag_params + [limit])


def get_most_traded(hours, limit, tag: str | None = None, rank_mode: str = "max"):
    tag_clause, tag_params = _tag_filter(tag)
    rank_clause = _rank_clause(rank_mode)

    if hours > 48:
        return _top_query_90d(
            days=hours // 24, tag_clause=tag_clause, rank_clause=rank_clause,
            rank_mode=rank_mode,
            order_by="SUM(s.volume) DESC", tag_params=tag_params, limit=limit, having="",
        )

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')  AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')  AS item_name_de,
            i.slug,
            MAX(s.ts)                        AS datetime,
            AVG(s.avg_price)                 AS avg_price,
            MIN(s.min_price)                 AS min_price,
            MAX(s.max_price)                 AS max_price,
            SUM(s.volume)                    AS volume,
            i.max_rank                       AS max_rank,
            i.thumb_path,
            i.image_path,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            {_vw_avg('s.median')}            AS median,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause}
          {rank_clause}
          {_plausible_clause()}
        GROUP BY i.id, i.slug, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol, i.max_rank
        ORDER BY volume DESC, i.slug
        LIMIT %s
    """, tag_params + [limit])


# ──────────────────────────────────────────────
# VORBERECHNETE RANGLISTEN
# ──────────────────────────────────────────────

# Tiefe der Vorberechnung. Das Frontend fragt 10 an, die API erlaubt bis 200 —
# alles über dieser Grenze fällt auf die Live-Berechnung zurück. 50 deckt jede
# realistische Anfrage ab und kostet 72 Kombinationen × 4 Listen × 50 = 14.400
# Zeilen, also nichts.
PRECOMPUTE_DEPTH = 50

# Welche Funktion welche Liste berechnet. Der Precompute-Lauf und der
# Live-Rückfall greifen auf dieselbe Abbildung zu — dadurch KANN sich die
# vorberechnete Liste nicht von der berechneten unterscheiden.
TOP_LIST_KINDS = {
    "performer": lambda h, lim, tag, rm, m: get_top_performers(h, lim, tag=tag, rank_mode=rm, metric=m),
    "loser":     lambda h, lim, tag, rm, m: get_top_losers(h, lim, tag=tag, rank_mode=rm, metric=m),
    "seller":    lambda h, lim, tag, rm, m: get_top_sellers(h, lim, tag=tag, rank_mode=rm),
    "traded":    lambda h, lim, tag, rm, m: get_most_traded(h, lim, tag=tag, rank_mode=rm),
}


def compute_top_list(kind, hours, limit, tag=None, rank_mode="max", metric="pct"):
    """Live-Berechnung einer Rangliste, bereits JSON-tauglich."""
    return _jsonable(TOP_LIST_KINDS[kind](hours, limit, tag, rank_mode, metric))


def read_top_list(kind, hours, limit, tag=None, rank_mode="max", metric="pct"):
    """
    Rangliste aus der Vorberechnung, sonst live.

    Der Rückfall ist kein Randfall, sondern der Sicherheitsgurt: er greift, wenn
    der Precompute-Lauf nie lief, fehlschlug, oder wenn nach Parametern gefragt
    wird, die er nicht abdeckt (rank_mode ≠ max, Tiefe > PRECOMPUTE_DEPTH).
    Lieber langsam und richtig als schnell und veraltet.
    """
    if rank_mode == "max" and limit <= PRECOMPUTE_DEPTH:
        rows = query("""
            SELECT payload
            FROM top_lists
            WHERE hours = %s
              AND COALESCE(tag, '') = COALESCE(%s, '')
              AND metric = %s
              AND list_kind = %s
              AND rank <= %s
              -- Frischeschutz: die Vorberechnung gilt nur für genau den
              -- Datenstand, aus dem sie entstand.
              AND source_updated = (SELECT value::timestamptz FROM metadata
                                    WHERE key = 'last_updated')
            ORDER BY rank
        """, (hours, tag, metric, kind, limit))
        if rows:
            return [r["payload"] for r in rows]

    return compute_top_list(kind, hours, limit, tag, rank_mode, metric)


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
            WITH {_change_pct_cte_90d(days, rank_mode)}
            SELECT
                (i.raw->'i18n'->'en'->>'name')       AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')       AS item_name_de,
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
            WHERE {_window_90d(days)}
              {tag_clause} {rank_clause} {_plausible_clause()}
            GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol
            HAVING SUM(s.volume) >= %s
            ORDER BY SUM(s.volume) DESC
            LIMIT %s
        """, tag_params + [min_volume, limit])

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')       AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')       AS item_name_de,
            i.slug, i.tags, i.max_rank            AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
            MIN(s.min_price)                      AS min_price,
            MAX(s.max_price)                      AS max_price,
            SUM(s.volume)                         AS volume,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause} {rank_clause} {_plausible_clause()}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol
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
            WITH {_change_pct_cte_90d(days, rank_mode)}
            SELECT
                (i.raw->'i18n'->'en'->>'name')       AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')       AS item_name_de,
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
            WHERE {_window_90d(days)}
              {tag_clause} {rank_clause} {_plausible_clause()}
            GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol
            HAVING SUM(s.volume) >= %s AND MAX(s.max_price) <= AVG(s.avg_price) * 10
            ORDER BY AVG(s.avg_price) DESC
            LIMIT %s
        """, tag_params + [min_volume, limit])

    return query(f"""
        WITH {_change_pct_cte(hours, rank_mode)}
        SELECT
            (i.raw->'i18n'->'en'->>'name')       AS item_name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')       AS item_name_de,
            i.slug, i.tags, i.max_rank            AS max_rank,
            i.thumb_path, i.image_path,
            ROUND(AVG(s.avg_price)::numeric, 2)  AS avg_price,
            MIN(s.min_price)                      AS min_price,
            MAX(s.max_price)                      AS max_price,
            SUM(s.volume)                         AS volume,
            ROUND(((c.price - p.price) / NULLIF(p.price, 0) * 100)::numeric, 1) AS change_pct,
            ROUND(c.price::numeric, 2)             AS current_price,
            ROUND((c.price - p.price)::numeric, 2) AS change_abs,
            (c.vol - p.vol)                        AS volume_change_abs,
            ROUND(((c.vol - p.vol)::numeric / NULLIF(p.vol, 0) * 100)::numeric, 1) AS volume_change_pct,
            ROUND({_credibility()}, 2) AS confidence
        FROM market_stats_48h s
        JOIN market_items i        ON i.id = s.item_id
        JOIN current_price c       ON c.item_id = s.item_id
        LEFT JOIN previous_price p ON p.item_id = s.item_id
        WHERE {_window_48h(hours)}
          {tag_clause} {rank_clause} {_plausible_clause()}
        GROUP BY i.id, i.slug, i.tags, i.max_rank, i.thumb_path, i.image_path, c.price, p.price, c.vol, p.vol
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
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')        AS item_name_de,
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
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')        AS item_name_de,
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
          {tag_clause} {rank_clause} {_plausible_clause()}
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
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name')        AS item_name_de,
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

def _like_escape(term: str) -> str:
    """
    Maskiert die LIKE-Metazeichen einer Nutzereingabe.

    Ohne das ist `q=%` kein Suchbegriff, sondern ein Platzhalter für alles: die
    Suche lieferte dann die zehn meistgehandelten Items statt „nichts gefunden",
    und `q=_____` traf jedes Wort ab fünf Zeichen. Ein Sicherheitsproblem ist es
    nicht — gemessen dauert `q=%%%%%` 46 ms, genauso lange wie `q=ember` —,
    aber die Antwort war schlicht falsch.

    Absichtlich KEINE Zeichen-Whitelist auf q: echte Itemnamen enthalten
    Apostrophe („Warrior's Rest"), Klammern („Melee Riven Mod (Veiled)") und
    Umlaute („Höllvanian Old Town in Fall"). Ein Filter darauf würde die Suche
    beschädigen, ohne ein Risiko abzuwehren — q ist an jeder Stelle als
    %s-Parameter gebunden.
    """
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search_items(search_term: str, limit: int = 8):
    """
    Autocomplete-Suche über market_items.

    Bewusst OHNE wfpe-JOIN: 788 der 3.825 Market-Items (u.a. sämtliche Relics)
    haben keinen game_ref-Match und wären sonst unauffindbar. Gesucht wird auf
    dem Market-Namen und zusätzlich auf dem Slug (Unterstriche → Leerzeichen),
    damit "ember prime set" und "ember_prime_set" beide treffen.

    Ranking: exakter Treffer → Präfix-Treffer → Teiltreffer, dann Volumen.
    Preisdaten per LEFT JOIN, damit Items ohne Trades trotzdem erscheinen.

    Preisquelle in drei Stufen, damit moeglichst jede Zeile eine Zahl traegt:
    aktueller 48h-Schnitt → letzter Tag mit Handel aus market_stats_90d
    (`price_day` nennt ihn) → niedrigstes Verkaufsangebot (`is_offer`).
    Von 3825 Items bleiben damit 90 ohne Preis statt 844: 2421 haben frische
    Handelsdaten, 1292 einen aelteren Handelstag, 22 nur ein Angebot.

    Die verbleibenden 90 zerfallen in 38 ohne jede Statistikzeile und 52, deren
    Zeilen an _rank_clause("max") scheitern — Mods, die nur ungerankt gehandelt
    wurden. Deren Preis waere eine andere Ware als die angezeigte Rangstufe
    ("Ward Recovery" Rang 0 statt Rang 3); lieber keine Zahl als die falsche.

    Die Sortierung bleibt am 48h-Handelsvolumen — ein Ersatzpreis aendert die
    Anzeige, nicht die Rangfolge.
    """
    term = search_term.strip()
    esc  = _like_escape(term)
    like = f"%{esc}%"
    return query(f"""
        WITH prices AS (
            SELECT
                s.item_id,
                ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
                SUM(s.volume)                       AS volume
            FROM market_stats_48h s
            JOIN market_items i ON i.id = s.item_id
            -- Anker am juengsten Datenpunkt wie ueberall sonst, nicht NOW():
            -- mit NOW() verlor ein Item seinen Preis, sobald sein letzter
            -- Bucket aelter als 48h wurde — der Sync laeuft aber nur einmal
            -- taeglich, und refresh_sell_offers hatte es zu seiner Laufzeit
            -- noch als "hat Daten" eingestuft. 59 Items fielen so durch.
            -- Der Plausibilitaetsfilter kostet hier nichts (kein Item verliert
            -- dadurch alle Zeilen), haelt aber Ausreisser aus dem Schnitt.
            WHERE {_window_48h(48)}
              {_rank_clause("max")}
              {_plausible_clause()}
            GROUP BY s.item_id
        )
        SELECT
            (i.raw->'i18n'->'en'->>'name') AS name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name') AS name_de,
            i.slug, i.thumb_path, i.tags, i.max_rank,
            -- Ohne frischen Handel der letzte Handelstag, sonst das niedrigste
            -- Verkaufsangebot, statt die Zelle leer zu lassen.
            -- KEIN Prozentzeichen in diesem Kommentar: psycopg2 liest jedes
            -- einzelne Prozentzeichen im Query-String als Platzhalter.
            COALESCE(p.avg_price, d.avg_price, i.sell_price_min)     AS avg_price,
            d.day                                                    AS price_day,
            (p.avg_price IS NULL AND d.avg_price IS NULL
             AND i.sell_price_min IS NOT NULL)                       AS is_offer,
            p.volume
        FROM market_items i
        LEFT JOIN prices p ON p.item_id = i.id
        -- Letzter Tag MIT Handel. Die Bedingung auf p.avg_price steht INNEN,
        -- damit der Zweig fuer Items mit frischem Preis gar nicht erst laeuft.
        -- Gewichtung und Plausibilitaetsfilter wie in get_item_history bzw. den
        -- Ranglisten — ohne den Filter meldete "Warm Coat" hier 500.067 ₱.
        LEFT JOIN LATERAL (
            SELECT s.day, {_vw_avg('s.avg_price')} AS avg_price
            FROM market_stats_90d s
            WHERE p.avg_price IS NULL
              AND s.item_id = i.id
              {_rank_clause("max")}
              {_plausible_clause()}
            GROUP BY s.day
            HAVING {_vw_avg('s.avg_price')} IS NOT NULL
            ORDER BY s.day DESC
            LIMIT 1
        ) d ON TRUE
        -- Gesucht wird in BEIDEN Sprachen, unabhängig davon, welche gerade
        -- angezeigt wird: „Einkerbung" muss dasselbe Item finden wie
        -- „Serration", sonst läuft die Suche im Deutsch-Modus ins Leere und im
        -- Englisch-Modus findet niemand ein Item, dessen deutschen Namen er aus
        -- dem Spiel kennt. Beide Namen liegen in derselben Zeile, es kommt kein
        -- JOIN dazu — und beide Pfade sind indiziert (migrations/010).
        WHERE (i.raw->'i18n'->'en'->>'name') ILIKE %s ESCAPE '\\'
           OR (i.raw->'i18n'->'de'->>'name') ILIKE %s ESCAPE '\\'
           OR REPLACE(i.slug, '_', ' ') ILIKE %s ESCAPE '\\'
        ORDER BY
            CASE
                WHEN LOWER(i.raw->'i18n'->'en'->>'name') = LOWER(%s)      THEN 0
                WHEN LOWER(i.raw->'i18n'->'de'->>'name') = LOWER(%s)      THEN 0
                WHEN (i.raw->'i18n'->'en'->>'name')      ILIKE %s ESCAPE '\\' THEN 1
                WHEN (i.raw->'i18n'->'de'->>'name')      ILIKE %s ESCAPE '\\' THEN 1
                ELSE 2
            END,
            COALESCE(p.volume, 0) DESC,
            LENGTH(i.raw->'i18n'->'en'->>'name')
        LIMIT %s
    """, (like, like, like, term, term, f"{esc}%", f"{esc}%", limit))


# ──────────────────────────────────────────────
# ITEM-DETAILSEITE
# ──────────────────────────────────────────────

def get_item_detail(slug: str):
    """
    Stammdaten + Kennzahlen (24h/48h) für ein einzelnes Item.
    Gibt None zurück, wenn der Slug unbekannt ist.
    """
    rows = query(f"""
        WITH target AS (
            SELECT id, slug, tags, ducats, max_rank, thumb_path, image_path,
                   price_median,
                   sell_price_min, sell_price_rank, sell_price_status, sell_orders_at,
                   (raw->'i18n'->'en'->>'name') AS name,
                   COALESCE(NULLIF(raw->'i18n'->'de'->>'name', ''), raw->'i18n'->'en'->>'name') AS name_de
            FROM market_items WHERE slug = %s
        ),
        w24 AS (
            SELECT
                ROUND(
                    (SUM(s.avg_price * GREATEST(s.volume, 1))
                     / NULLIF(SUM(GREATEST(s.volume, 1)), 0))::numeric, 2
                )                AS avg_price,
                MIN(s.min_price) AS min_price,
                MAX(s.max_price) AS max_price,
                SUM(s.volume)    AS volume,
                MAX(s.ts)        AS last_ts
            FROM market_stats_48h s, target i
            WHERE s.item_id = i.id
              AND s.ts >= NOW() - INTERVAL '24 hours'
              {_rank_clause("max")}
              {_plausible_clause()}
        ),
        w48 AS (
            SELECT
                ROUND(
                    (SUM(s.avg_price * GREATEST(s.volume, 1))
                     / NULLIF(SUM(GREATEST(s.volume, 1)), 0))::numeric, 2
                )                AS avg_price,
                MIN(s.min_price) AS min_price,
                MAX(s.max_price) AS max_price,
                SUM(s.volume)    AS volume
            FROM market_stats_48h s, target i
            WHERE s.item_id = i.id
              AND s.ts >= NOW() - INTERVAL '48 hours'
              {_rank_clause("max")}
              {_plausible_clause()}
        ),
        prev24 AS (
            -- Vergleichsfenster für change_pct: 24-48h vor jetzt
            SELECT
                ROUND(
                    (SUM(s.avg_price * GREATEST(s.volume, 1))
                     / NULLIF(SUM(GREATEST(s.volume, 1)), 0))::numeric, 2
                ) AS avg_price
            FROM market_stats_48h s, target i
            WHERE s.item_id = i.id
              AND s.ts >= NOW() - INTERVAL '48 hours'
              AND s.ts <  NOW() - INTERVAL '24 hours'
              {_rank_clause("max")}
              {_plausible_clause()}
        ),
        ranks AS (
            SELECT ARRAY_AGG(DISTINCT s.mod_rank ORDER BY s.mod_rank) AS mod_ranks
            FROM market_stats_90d s, target i
            WHERE s.item_id = i.id AND s.mod_rank IS NOT NULL
        )
        SELECT
            i.id, i.name, i.slug, i.tags, i.ducats, i.max_rank,
            i.thumb_path, i.image_path,
            w24.avg_price AS avg_price_24h,
            w24.min_price AS min_price_24h,
            w24.max_price AS max_price_24h,
            w24.volume    AS volume_24h,
            w24.last_ts   AS last_trade,
            w48.avg_price AS avg_price_48h,
            w48.min_price AS min_price_48h,
            w48.max_price AS max_price_48h,
            w48.volume    AS volume_48h,
            ROUND(
                ((w24.avg_price - prev24.avg_price)
                 / NULLIF(prev24.avg_price, 0) * 100)::numeric, 1
            ) AS change_pct,
            ranks.mod_ranks,
            -- Niedrigstes Verkaufsangebot. Nur gefüllt, wenn das Item keine
            -- Handelsdaten hat (siehe refresh_sell_offers). Ein Angebot ist KEIN
            -- Handelspreis — die Oberfläche weist es getrennt aus.
            i.sell_price_min, i.sell_price_rank, i.sell_price_status, i.sell_orders_at
        FROM target i, w24, w48, prev24, ranks
    """, (slug,))
    return rows[0] if rows else None


def get_item_history(slug: str, hours: int = 48, mod_rank: int | None = None):
    """
    Zeitreihe für den Preisgraphen.

    hours <= 48 → market_stats_48h (stündlich), sonst market_stats_90d (täglich).
    avg_price ist volumen-gewichtet, damit ein einzelner Ausreißer-Trade den
    Punkt nicht dominiert.

    mod_rank gesetzt → hart auf diesen Rang filtern; sonst greift _rank_clause("max"),
    also dieselbe Rang-Semantik wie in den Top-Listen.
    """
    if mod_rank is not None:
        rank_clause, rank_params = "AND s.mod_rank = %s", [mod_rank]
    else:
        rank_clause, rank_params = _rank_clause("max"), []

    bucket = "s.ts" if hours <= 48 else "s.day"
    table  = "market_stats_48h" if hours <= 48 else "market_stats_90d"
    # Anker ist der jüngste Datenpunkt, nicht NOW(): steht der Sync, wäre der
    # 24H-Graph sonst leer, während die Ranglisten weiter rechnen — und bei den
    # Tagesdaten liefen Graph und Kennzahl um die Verzögerung auseinander.
    if hours <= 48:
        window = f"AND s.ts >= (SELECT MAX(ts) FROM market_stats_48h) - INTERVAL '{hours} hours'"
    else:
        window = (f"AND s.day >= ((SELECT MAX(day) FROM market_stats_90d)"
                  f" - INTERVAL '{max(1, hours // 24)} days')::date")

    return query(f"""
        SELECT
            {bucket} AS t,
            {_vw_avg('s.avg_price')}    AS avg_price,
            MIN(s.min_price)            AS min_price,
            MAX(s.max_price)            AS max_price,
            SUM(s.volume)               AS volume,
            {_vw_avg('s.open_price')}   AS open_price,
            {_vw_avg('s.closed_price')} AS closed_price,
            {_vw_avg('s.median')}       AS median,
            {_vw_avg('s.moving_avg')}   AS moving_avg,
            MAX(s.donch_top)            AS donch_top,
            MIN(s.donch_bot)            AS donch_bot
        FROM {table} s
        JOIN market_items i ON i.id = s.item_id
        WHERE i.slug = %s
          {window}
          {rank_clause}
        GROUP BY {bucket}
        ORDER BY {bucket}
    """, [slug] + rank_params)


def get_drop_sources_for_slug(slug: str):
    """
    Drop-Quellen für ein Item, per Slug und dedupliziert.

    item_drop_sources hält pro Relic vier Zeilen (eine je relic_quality) mit
    identischen Chancen — DISTINCT ON wirft die Duplikate raus. Enthält alle
    drei source_types (relic / enemy / mission).
    """
    return query("""
        SELECT DISTINCT ON (ds.source_type, COALESCE(ds.relic_name, ds.droptable_path), ds.rarity)
            ds.source_type, ds.relic_era, ds.relic_category, ds.relic_name,
            ds.droptable_name, ds.droptable_path, ds.rarity,
            ds.drop_chance_intact, ds.drop_chance_exceptional,
            ds.drop_chance_flawless, ds.drop_chance_radiant,
            ds.drop_chance_enemy, ds.drop_chance_best
        FROM item_drop_sources ds
        JOIN market_items i ON i.id = ds.item_id
        WHERE i.slug = %s
        ORDER BY ds.source_type, COALESCE(ds.relic_name, ds.droptable_path), ds.rarity,
                 ds.drop_chance_best DESC
    """, (slug,))


def get_relic_contents(item_name: str):
    """
    Reverse-Lookup für Relic-Items: was steckt in diesem Relic?

    Relics selbst haben keine Einträge in item_drop_sources — wohl aber alle
    Items, die aus ihnen droppen. Der Relic-Name im Item-Namen ("Axi E1 Relic")
    entspricht dabei item_drop_sources.relic_name ("Axi E1").
    """
    relic_name = item_name.replace(" Relic", "").strip()
    return query(f"""
        WITH prices AS (
            SELECT
                s.item_id,
                ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
                SUM(s.volume)                       AS volume
            FROM market_stats_48h s
            JOIN market_items i ON i.id = s.item_id
            WHERE s.ts >= NOW() - INTERVAL '48 hours'
              {_rank_clause("max")}
            GROUP BY s.item_id
        )
        SELECT DISTINCT ON (ds.item_id)
            (i.raw->'i18n'->'en'->>'name') AS name,
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name') AS name_de,
            i.slug, i.thumb_path, i.ducats,
            ds.rarity,
            ds.drop_chance_intact, ds.drop_chance_exceptional,
            ds.drop_chance_flawless, ds.drop_chance_radiant,
            p.avg_price, p.volume
        FROM item_drop_sources ds
        JOIN market_items i     ON i.id = ds.item_id
        LEFT JOIN prices p      ON p.item_id = ds.item_id
        WHERE ds.relic_name = %s
        ORDER BY ds.item_id, ds.drop_chance_intact DESC
    """, (relic_name,))


def get_set_parts(slug: str):
    """
    Set und zugehörige Einzelteile.

    Zuordnung über das Slug-Präfix — alle 230 Set-Slugs enden auf '_set'.
    Wichtig: das LÄNGSTE passende Präfix gewinnt, sonst würde z.B.
    'velox_prime_barrel' (Präfix 'velox') fälschlich dem 'velox_set'
    zugeschlagen statt dem 'velox_prime_set'.

    Gibt None zurück, wenn das Item zu keinem Set gehört.
    """
    if slug.endswith("_set"):
        set_slug = slug
    else:
        rows = query("""
            SELECT slug FROM market_items
            WHERE tags ? 'set'
              AND %s LIKE LEFT(slug, LENGTH(slug) - 4) || '\\_%%'
            ORDER BY LENGTH(slug) DESC
            LIMIT 1
        """, (slug,))
        if not rows:
            return None
        set_slug = rows[0]["slug"]

    prefix = set_slug[: -len("_set")]
    parts = query(f"""
        WITH prices AS (
            SELECT
                s.item_id,
                ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price,
                SUM(s.volume)                       AS volume
            FROM market_stats_48h s
            JOIN market_items i ON i.id = s.item_id
            WHERE s.ts >= NOW() - INTERVAL '48 hours'
              {_rank_clause("max")}
            GROUP BY s.item_id
        ),
        candidates AS (
            SELECT i.*
            FROM market_items i
            WHERE i.slug = %s
               OR i.slug LIKE %s || '\\_%%'
        )
        SELECT
            (c.raw->'i18n'->'en'->>'name') AS name,
            COALESCE(NULLIF(c.raw->'i18n'->'de'->>'name', ''), c.raw->'i18n'->'en'->>'name') AS name_de,
            c.slug, c.thumb_path, c.ducats,
            (c.slug = %s) AS is_set,
            p.avg_price, p.volume
        FROM candidates c
        LEFT JOIN prices p ON p.item_id = c.id
        -- Teile, die zu einem längeren (spezifischeren) Set gehören, ausschließen
        WHERE NOT EXISTS (
            SELECT 1 FROM market_items o
            WHERE o.tags ? 'set'
              AND o.slug <> %s
              AND LENGTH(o.slug) > LENGTH(%s)
              AND c.slug LIKE LEFT(o.slug, LENGTH(o.slug) - 4) || '\\_%%'
        )
        ORDER BY is_set DESC, c.slug
    """, (set_slug, prefix, set_slug, set_slug, set_slug))

    # Ein Set ohne Teile ist keine sinnvolle Gegenüberstellung
    return parts if len(parts) > 1 else None


def get_item_combined(name: str, hours: int = 24):
    wf_data = query("""
        SELECT unique_name, name_en, name_de, export_type, raw
        FROM wfpe_items
        WHERE name_en ILIKE %s ESCAPE '\\'
        ORDER BY
            CASE
                WHEN LOWER(name_en) = LOWER(%s) THEN 0
                WHEN name_en ILIKE %s ESCAPE '\\' THEN 1
                ELSE 2
            END,
            LENGTH(name_en)
        LIMIT 5
    """, (f"%{_like_escape(name)}%", name, f"{_like_escape(name)} %"))

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
        WHERE w.name_en ILIKE %s ESCAPE '\\'
          AND s.ts >= NOW() - INTERVAL '{hours} hours'
        GROUP BY i.id, i.slug, i.max_rank, i.thumb_path, i.image_path
        ORDER BY SUM(s.volume) DESC
        LIMIT 5
    """, (f"%{_like_escape(name)}%",))

    return {"wiki": wf_data, "market": market_data}


def get_category_by_tag(tag: str, limit: int = 20):
    if tag == "all":
        return query("""
            SELECT
                (i.raw->'i18n'->'en'->>'name') AS name,
                COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name') AS name_de,
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
            COALESCE(NULLIF(i.raw->'i18n'->'de'->>'name', ''), i.raw->'i18n'->'en'->>'name') AS name_de,
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
        return ('Misc', 'Other')

    return ('Unsorted', None)


# ──────────────────────────────────────────────
# WARFRAME-ÜBERSICHT
# ──────────────────────────────────────────────

def get_warframe_rows():
    """
    Rohzeilen der Warframe-Übersicht — Basiswerte, Wiki-Ergänzung, Marktbezug.

    Die ZEILEN kommen aus wfpe_items, nicht aus wiki_warframes: das Wiki-Modul
    wird von Hand gepflegt, und ein Aussetzer dort darf keine Frames kosten.
    Fehlt die Ergänzung, rechnet api/warframes.py mit dem Standardwachstum
    weiter (siehe dort).

    productCategory = 'Suits' schließt Archwings (SpaceSuits) und Necramechs
    (MechSuits) aus. Die sind bewusst nicht Teil der Übersicht: sie spielen in
    einer anderen Klasse und verzerrten jeden Median.

    Der Preis ist der des Prime-Sets und existiert nur für 50 der 117 Frames.
    Er folgt derselben Stufung wie die Suche: 48h-Handelsschnitt, sonst
    niedrigstes Verkaufsangebot.

    DIE ABFRAGE GEHT VON DEN 117 FRAMES AUS, nicht von den Markt-Items — und das
    ist der ganze Unterschied zwischen 36 ms und 240 ms. In der ersten Fassung
    stand `LEFT JOIN market_items i ON i.game_ref = w.unique_name` frei im
    SELECT; `game_ref` hat keinen Index, und der Planer schätzte die Trefferzahl
    auf 1. Ergebnis war ein Nested Loop, der für JEDEN Frame alle 3825 Items
    sequentiell durchging: `Rows Removed by Join Filter: 447.475`.

    Mit der `frames`-CTE als Ausgangspunkt fällt der Marktbezug auf ~50 Zeilen
    zusammen, und die Preis-CTE muss nur noch deren Statistiken mitteln statt
    die der ganzen Tabelle. Wer hier umbaut, prüft den Plan mit EXPLAIN ANALYZE
    nach — die Zeile „Rows Removed by Join Filter" verrät den Rückfall sofort.
    """
    return query(f"""
        WITH frames AS (
            SELECT w.unique_name, w.name_en, w.raw
            FROM wfpe_items w
            WHERE w.export_type = 'ExportWarframes'
              AND w.raw->>'productCategory' = 'Suits'
        ),
        mk AS (
            SELECT i.id, i.game_ref, i.slug, i.thumb_path,
                   i.sell_price_min, i.max_rank, i.price_median
            FROM market_items i
            JOIN frames f ON f.unique_name = i.game_ref
        ),
        prices AS (
            SELECT s.item_id, ROUND(AVG(s.avg_price)::numeric, 2) AS avg_price
            FROM market_stats_48h s
            JOIN mk i ON i.id = s.item_id
            WHERE {_window_48h(48)}
              {_rank_clause("max")}
              {_plausible_clause()}
            GROUP BY s.item_id
        )
        SELECT
            f.unique_name,
            f.name_en,
            f.raw,
            k.payload,
            mk.slug,
            mk.thumb_path,
            COALESCE(p.avg_price, mk.sell_price_min)                AS price,
            (p.avg_price IS NULL AND mk.sell_price_min IS NOT NULL) AS price_is_offer
        FROM frames f
        LEFT JOIN wiki_warframes k ON k.internal_name = f.unique_name
        LEFT JOIN mk                ON mk.game_ref    = f.unique_name
        LEFT JOIN prices p          ON p.item_id      = mk.id
    """)