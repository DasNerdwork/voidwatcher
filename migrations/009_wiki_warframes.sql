-- 009_wiki_warframes.sql
-- ============================================================
-- Ergänzungsdaten aus dem Wiki-Datenmodul `Module:Warframes/data` für die
-- Warframe-Übersicht (/warframes).
--
-- Warum überhaupt eine zweite Quelle: die BASISWERTE stehen bereits vollständig
-- in `wfpe_items` (export_type = 'ExportWarframes'), und DEs Export ist dafür die
-- maßgebliche Quelle - Wiki und Export stimmen bei allen 117 Warframes auf die
-- Einheit überein. Was der Export NICHT enthält, ist das Wachstum bis Rang 30.
-- Das steckt im Spielclient und ist öffentlich nur im Wiki nachgezeichnet.
--
-- Das ist keine Kleinigkeit: 33 der 117 Frames wachsen anders als die Regel
-- „+100 Leben, +100 Schilde, +50 Energie". Ohne die Tabelle stünde
-- Inaros bei 2210 statt 2310 Leben, Hildryn bei 1380 statt 1780 Schilden,
-- Dante bei 400/250/250 statt 390/240/270, Grendel bei 195 statt 95 Schilden.
-- Genau dieser Fehler steckt bis heute in der Google-Tabelle, die diese Seite
-- ablöst - dort waren die Sonderregeln zwar vorgesehen, verglichen aber gegen
-- Pfade auf `…BaseSuit`, die es im Export nicht gibt, und liefen samt und
-- sonders ins Leere.
--
-- Zweite Sache, die nur hier steht: die Startenergie. Die Tabelle rechnete
-- „halbe Kapazität"; das trifft bei 107 von 119 Frames nicht zu (Ash startet mit
-- 50, nicht mit 75). Es ist ein eigener Wert je Frame.
--
-- `payload` als JSONB wie bei `top_lists` (Migration 008): das Modul führt
-- Passiv, Fähigkeiten, Polaritäten, Aura, Helminth-Fähigkeit, Progenitor-Element
-- und Einführungs-Update mit. Als Einzelspalten hätte jedes weitere Feld eine
-- Migration erzwungen.
--
-- WICHTIG für alles, was darauf aufbaut: die ZEILEN der Übersicht kommen aus
-- `wfpe_items`, diese Tabelle liefert nur Zusätze. Ein Frame ohne Wiki-Eintrag
-- fällt auf das Standardwachstum zurück, verschwindet aber nie aus der Liste.
-- Das Modul wird von Hand gepflegt und formatiert uneinheitlich; es darf keine
-- Quelle sein, deren Aussetzer Zeilen kosten.

BEGIN;

CREATE TABLE IF NOT EXISTS wiki_warframes (
    internal_name TEXT PRIMARY KEY,          -- = wfpe_items.unique_name
    name          TEXT NOT NULL,
    payload       JSONB NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMIT;
