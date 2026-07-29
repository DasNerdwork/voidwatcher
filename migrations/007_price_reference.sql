-- 007_price_reference.sql
-- ============================================================
-- Referenzpreis je Item für die Ausreißererkennung.
--
-- Die Daten von warframe.market sind Nutzerangaben, keine Ingame-Trades — jeder
-- kann ein Item zu einem beliebigen Preis einstellen. Beispiele aus dem Bestand:
--
--   Warm Coat                 500.067 ₱   Median des Items:  10 ₱   → 50.007×
--   The Teacher Earth Scene   500.000 ₱   Median des Items: 120 ₱   →  4.167×
--   Goopolla                   99.999 ₱   Median des Items:   1 ₱   → 92.592×
--
-- Als Maßstab dient der Median des jeweiligen Items, nicht eine absolute Grenze:
-- 99 % aller Beobachtungen liegen unter dem 4,8-fachen ihres Item-Medians, 99,9 %
-- unter dem 15-fachen. Oberhalb von 20× bleiben 81 von 285.461 Zeilen (0,03 %) —
-- darunter alle zwölf Einträge über 5.000 ₱.
--
-- Vorberechnet statt zur Abfragezeit: der Median je Item kostet inline 154 ms,
-- was sich bei vier Ranglisten pro /api/top-Aufruf vervierfacht. Zudem soll die
-- Referenz stabil sein und nicht mit dem gewählten Zeitraum schwanken — deshalb
-- immer über das volle 90-Tage-Fenster.
--
-- NULL bedeutet "keine Referenz" (neues Item, noch keine Historie). Der Filter
-- greift dann bewusst nicht: unbekannt ist nicht dasselbe wie manipuliert.

BEGIN;

ALTER TABLE market_items ADD COLUMN IF NOT EXISTS price_median numeric;

UPDATE market_items i
SET price_median = m.med
FROM (
    SELECT item_id, percentile_disc(0.5) WITHIN GROUP (ORDER BY avg_price) AS med
    FROM market_stats_90d
    GROUP BY item_id
) m
WHERE m.item_id = i.id;

COMMIT;
