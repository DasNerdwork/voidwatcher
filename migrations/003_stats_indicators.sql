-- 003_stats_indicators.sql
-- ============================================================
-- Speichert die Indikator-Felder, die die warframe.market-Statistics-API
-- ohnehin pro Eintrag mitliefert, bisher aber im Sync verworfen wurden:
--
--   open_price / closed_price  → Candlesticks
--   donch_top  / donch_bot     → Donchian-Kanal
--   median     / moving_avg    → aktuell nicht dargestellt, aber mitgespeichert,
--                                damit dafür keine zweite Migration nötig wird
--
-- Alle Spalten nullable: Bestandszeilen bleiben zunächst leer und werden vom
-- nächsten Sync-Lauf gefüllt. Das funktioniert nur, weil store_48h_stats /
-- store_90d_stats gleichzeitig von ON CONFLICT DO NOTHING auf DO UPDATE
-- umgestellt werden - sonst würden vorhandene Zeilen übersprungen.
--
-- Die API gibt bei jedem Abruf das vollständige 90-Tage-Fenster zurück,
-- die Historie füllt sich dadurch rückwirkend von selbst.

BEGIN;

ALTER TABLE market_stats_48h
  ADD COLUMN IF NOT EXISTS open_price   numeric,
  ADD COLUMN IF NOT EXISTS closed_price numeric,
  ADD COLUMN IF NOT EXISTS median       numeric,
  ADD COLUMN IF NOT EXISTS moving_avg   numeric,
  ADD COLUMN IF NOT EXISTS donch_top    numeric,
  ADD COLUMN IF NOT EXISTS donch_bot    numeric;

ALTER TABLE market_stats_90d
  ADD COLUMN IF NOT EXISTS open_price   numeric,
  ADD COLUMN IF NOT EXISTS closed_price numeric,
  ADD COLUMN IF NOT EXISTS median       numeric,
  ADD COLUMN IF NOT EXISTS moving_avg   numeric,
  ADD COLUMN IF NOT EXISTS donch_top    numeric,
  ADD COLUMN IF NOT EXISTS donch_bot    numeric;

COMMIT;
