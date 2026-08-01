-- 005_stats_subtype.sql
-- ============================================================
-- Dritte Dimension neben mod_rank: subtype.
--
-- Die warframe.market-API liefert für manche Items mehrere Zeilen pro Zeitpunkt,
-- unterschieden durch "subtype" - bei Fischen z.B. small / medium / large, die
-- zu deutlich unterschiedlichen Preisen gehandelt werden. Beispiel goopolla:
-- drei Einträge für denselben Zeitstempel.
--
-- Ohne subtype im Schlüssel kollidieren diese Zeilen. Mit ON CONFLICT DO NOTHING
-- fiel das nie auf (es überlebte willkürlich eine), mit DO UPDATE bricht der
-- Insert ab: "command cannot affect row a second time".
--
-- Wie bei mod_rank kann subtype nicht direkt in einen PK (NULL für die meisten
-- Items) → COALESCE im Unique-Index.

BEGIN;

ALTER TABLE market_stats_48h ADD COLUMN IF NOT EXISTS subtype text;
ALTER TABLE market_stats_90d ADD COLUMN IF NOT EXISTS subtype text;

DROP INDEX IF EXISTS market_stats_48h_item_ts_rank_uk;
DROP INDEX IF EXISTS market_stats_90d_item_day_rank_uk;

CREATE UNIQUE INDEX IF NOT EXISTS market_stats_48h_item_ts_variant_uk
  ON market_stats_48h (item_id, ts, COALESCE(mod_rank, -1), COALESCE(subtype, ''));

CREATE UNIQUE INDEX IF NOT EXISTS market_stats_90d_item_day_variant_uk
  ON market_stats_90d (item_id, day, COALESCE(mod_rank, -1), COALESCE(subtype, ''));

COMMIT;
