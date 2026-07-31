-- 008_precomputed_tops.sql
-- ============================================================
-- Vorberechnete Ranglisten für die Startseite.
--
-- Gemessen vor dieser Änderung (Median aus 5 Läufen gegen 127.0.0.1:8090):
--
--   /api/top?hours=48    1,24 s   ← Vorgabe der Startseite
--   /api/top?hours=168   1,32 s
--   /api/top?hours=720   3,30 s
--   /api/top?hours=2160  8,60 s
--
-- Die Ursache ist nicht fehlende Indizierung: alle Tabellen liegen vollständig im
-- Shared Buffer, sämtliche Pläne zeigen `Shared Read Blocks = 0`. Es ist reine
-- CPU-Last, weil ein /api/top-Aufruf viermal dieselbe teure edges-CTE über
-- identische Eingaben baut (zwei WindowAgg + zwei Incremental Sort, dazu ein
-- HashAggregate, der bei work_mem = 4 MB auf Platte ausweicht) und sie dann per
-- Merge Join mit sich selbst verbindet.
--
-- Da sich die Daten nur einmal täglich ändern (Cron 08:00, dazu ~8 anlassbezogene
-- Syncs im Monat), wird das Ergebnis vom Sync vorberechnet.
--
-- Warum `payload` als JSONB statt Einzelspalten: die Rangliste hat in den letzten
-- Monaten mehrfach Felder bekommen (zuletzt `median`). Als Spalten hätte jedes
-- davon eine weitere Migration verlangt, und die Tabelle wäre unweigerlich hinter
-- der Abfrage zurückgeblieben. So reicht die API das Objekt unverändert durch.
--
-- `source_updated` ist der Frischeschutz: weicht der Wert von metadata.last_updated
-- ab, gilt die Vorberechnung als veraltet und die API rechnet live. Ein
-- fehlgeschlagener Precompute-Lauf führt damit zu langsamen, aber KORREKTEN
-- Antworten — nie zu schnellen falschen.

BEGIN;

CREATE TABLE IF NOT EXISTS top_lists (
    hours          INTEGER     NOT NULL,
    tag            TEXT,                    -- NULL = alle Kategorien
    metric         TEXT        NOT NULL,    -- pct | abs
    list_kind      TEXT        NOT NULL,    -- performer | loser | seller | traded
    rank           INTEGER     NOT NULL,    -- 1 … PRECOMPUTE_DEPTH
    payload        JSONB       NOT NULL,
    source_updated TIMESTAMPTZ NOT NULL
);

-- COALESCE(tag, '') wie bei den Stats-Tabellen: NULL ist in einem Unique-Index
-- nicht mit sich selbst gleich, ohne COALESCE wären Mehrfacheinträge für
-- „alle Kategorien" möglich.
CREATE UNIQUE INDEX IF NOT EXISTS top_lists_key
    ON top_lists (hours, COALESCE(tag, ''), metric, list_kind, rank);

-- Leseindex für den Abrufpfad: eine Liste wird immer komplett und in Rangfolge
-- geholt.
CREATE INDEX IF NOT EXISTS top_lists_lookup
    ON top_lists (hours, metric, list_kind, rank);

-- ------------------------------------------------------------------
-- Angebotspreise für Items ohne Handelsdaten.
--
-- 1290 von 3825 Items (33,7 %) haben kein 48h-Fenster und zeigen deshalb überall
-- „—". Für „Warm Coat" existieren gleichzeitig 107 sichtbare Verkaufsangebote.
--
-- Ein Angebot ist KEIN Handelspreis — die Oberfläche muss das getrennt
-- ausweisen. Deshalb eigene Spalten statt einer stillen Ergänzung von price_median
-- oder avg_price.
--
-- sell_price_rank ist nicht optional: /v2/orders/item/{slug}/top mischt Ränge.
-- Bei warm_coat stehen Rang 0 für 1 ₱ und Rang 3 für 7 ₱ in derselben Liste, und
-- das ist ein Unterschied, den der Leser kennen muss.
-- ------------------------------------------------------------------

ALTER TABLE market_items ADD COLUMN IF NOT EXISTS sell_price_min    NUMERIC;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS sell_price_rank   INTEGER;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS sell_price_status TEXT;
ALTER TABLE market_items ADD COLUMN IF NOT EXISTS sell_orders_at    TIMESTAMPTZ;

-- ------------------------------------------------------------------
-- Fehlende Einzelspalten-Indizes.
--
-- `SELECT MAX(ts)` bzw. `MAX(day)` verankert jedes Fenster und läuft zweimal je
-- Abfrage. Ohne diese Indizes ist das jedes Mal ein voller Seq Scan (48.670 bzw.
-- 286.819 Zeilen). Der Gewinn liegt bei wenigen Prozent der Gesamtlaufzeit — er
-- zählt für den Live-Rückfall und den Precompute-Lauf, nicht für den Normalfall.
-- ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_market_stats_48h_ts ON market_stats_48h (ts);
CREATE INDEX IF NOT EXISTS idx_market_stats_90d_day ON market_stats_90d (day);

COMMIT;
