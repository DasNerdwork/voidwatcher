-- 006_drop_stale_variant_rows.sql
-- ============================================================
-- Aufräumen nach 004/005.
--
-- Vor der Schlüsseländerung wurde je (item_id, ts|day) nur EINE Zeile gespeichert;
-- mod_rank und subtype waren nicht Teil des Schlüssels und wurden willkürlich
-- mit dem erstbesten Wert (meist NULL) belegt.
--
-- Seit 004/005 schreibt der Sync korrekt eine Zeile je (rank, subtype). Die alten
-- Zeilen liegen aber weiter daneben, weil ihr Schlüssel auf keine aktuelle
-- API-Zeile mehr passt und der Upsert sie nie trifft. Ergebnis: dieselbe
-- Beobachtung steht doppelt in der Tabelle und wird in jedem SUM(volume) /
-- volumengewichteten Mittel doppelt gezählt.
--
-- Beispiel rifle_riven_mod_(veiled), 2026-05-01:
--   subtype=NULL       vol=5    donch_top=NULL   ← Altbestand
--   subtype=revealed   vol=5    donch_top=20     ← dieselbe Beobachtung, neu
--   subtype=unrevealed vol=494  donch_top=25
--
-- Gelöscht wird nur, was nachweislich ein Duplikat ist: keine Indikatoren UND
-- avg/min/max identisch zu einer indikator-behafteten Zeile desselben Buckets.
-- Zeilen, die nur alt sind (ganze Items ohne Indikatoren), bleiben unangetastet -
-- sie sind echte Historie und laufen ohnehin aus dem 90-Tage-Fenster.
--
-- Betroffen zum Zeitpunkt der Erstellung: 19.206 Zeilen (90d) / 863 (48h),
-- zusammen 346.093 doppelt gezählte Trades über 827 Items.

BEGIN;

DELETE FROM market_stats_90d s
WHERE s.donch_top IS NULL
  AND EXISTS (
    SELECT 1 FROM market_stats_90d o
    WHERE o.item_id   = s.item_id
      AND o.day       = s.day
      AND o.donch_top IS NOT NULL
      AND o.avg_price IS NOT DISTINCT FROM s.avg_price
      AND o.min_price IS NOT DISTINCT FROM s.min_price
      AND o.max_price IS NOT DISTINCT FROM s.max_price
  );

DELETE FROM market_stats_48h s
WHERE s.donch_top IS NULL
  AND EXISTS (
    SELECT 1 FROM market_stats_48h o
    WHERE o.item_id   = s.item_id
      AND o.ts        = s.ts
      AND o.donch_top IS NOT NULL
      AND o.avg_price IS NOT DISTINCT FROM s.avg_price
      AND o.min_price IS NOT DISTINCT FROM s.min_price
      AND o.max_price IS NOT DISTINCT FROM s.max_price
  );

COMMIT;
