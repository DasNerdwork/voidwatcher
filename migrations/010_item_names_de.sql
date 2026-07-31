-- 010_item_names_de.sql
-- ============================================================
-- Deutsche Item-Namen: Index auf den zweiten Sprachzweig.
--
-- warframe.market liefert seine v2-Items nur einsprachig, SOLANGE man keinen
-- `Language:`-Header schickt. Mit `Language: de` enthält dieselbe Antwort
-- `i18n.en` UND `i18n.de` — 3677 der 3837 Namen sind dabei echt übersetzt,
-- inklusive der Relics („Requiem IV Relic" → „Requiem-Relikt: IV") und der Sets
-- („Frost Prime Set" → „Frost Prime: Set"). Der Sync sendet den Header seit
-- diesem Stand, das JSONB in market_items.raw trägt damit beide Sprachen.
--
-- Der Umweg über `wfpe_items.name_de` wurde geprüft und verworfen: dort weichen
-- nur 65 % der Namen überhaupt vom Englischen ab, alle 772 Relics haben gar
-- keinen Namen, und bei 255 Items (Sets, Baupläne) passt der Zuschnitt nicht —
-- „Ember Prime Set" steht dort als „Ember Prime", das Suffix müsste man raten.
--
-- Dieser Index ist das Gegenstück zu idx_market_items_i18n_en_name: die
-- Autocomplete-Suche filtert und sortiert künftig über BEIDE Namen, damit
-- „Einkerbung" dasselbe findet wie „Serration". Ohne ihn liefe die halbe Suche
-- über einen sequentiellen Scan.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_market_items_i18n_de_name
    ON market_items ((raw->'i18n'->'de'->>'name'));

COMMIT;
