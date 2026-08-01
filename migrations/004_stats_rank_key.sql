-- 004_stats_rank_key.sql
-- ============================================================
-- Der Primärschlüssel war (item_id, ts) bzw. (item_id, day) - ohne mod_rank.
-- Die warframe.market-API liefert für Mods und Arcanes aber MEHRERE Einträge
-- pro Zeitpunkt, einen je Rang (z.B. abating_link: 70 Tage × Rang 0 und 3).
--
-- Folge bisher: pro Zeitpunkt überlebte genau ein Rang, der Rest wurde von
-- ON CONFLICT DO NOTHING verworfen - welcher, hing von der Reihenfolge ab.
-- Deshalb liefert der Rang-Umschalter auf der Item-Seite nur Bruchstücke
-- (abating_link: 5 statt ~70 Punkte für R0).
--
-- mod_rank kann nicht direkt in den PK, weil er für Nicht-Mods NULL ist und
-- ein Primärschlüssel keine NULLs zulässt. Stattdessen ein Unique-Index über
-- COALESCE(mod_rank, -1); ON CONFLICT kann denselben Ausdruck als Ziel nutzen.

BEGIN;

ALTER TABLE market_stats_48h
  ALTER COLUMN item_id SET NOT NULL,
  ALTER COLUMN ts      SET NOT NULL,
  DROP CONSTRAINT IF EXISTS item_stats_48h_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS market_stats_48h_item_ts_rank_uk
  ON market_stats_48h (item_id, ts, COALESCE(mod_rank, -1));

ALTER TABLE market_stats_90d
  ALTER COLUMN item_id SET NOT NULL,
  ALTER COLUMN day     SET NOT NULL,
  DROP CONSTRAINT IF EXISTS item_stats_90d_pkey;

CREATE UNIQUE INDEX IF NOT EXISTS market_stats_90d_item_day_rank_uk
  ON market_stats_90d (item_id, day, COALESCE(mod_rank, -1));

COMMIT;
