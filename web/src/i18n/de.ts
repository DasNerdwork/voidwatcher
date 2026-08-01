/**
 * Deutsches Wörterbuch - Schlüssel ist der englische Quelltext.
 *
 * Vorbild ist /hdd1/clashapp/lang/*.csv: eine Datei je Fremdsprache, der
 * englische Satz als Schlüssel, kein Eintrag = englischer Text. Englisch braucht
 * deshalb kein eigenes Wörterbuch - es IST der Schlüsselraum.
 *
 * Gruppiert nach Ort im Bild, nicht alphabetisch: wer eine Seite umbaut, findet
 * ihre Texte am Stück. Platzhalter sind %s (Text) und %d (Zahl), in der
 * Reihenfolge der Argumente von t().
 *
 * NICHT hier drin und bewusst englisch: Item-Namen (die kommen zweisprachig aus
 * der API, siehe i18n/index.ts → itemName) und die Drop-Quellen-Bezeichnungen
 * („Meso S12", „AcolyteHeavyAgentDropTable"). Letztere sind interne Kennungen,
 * für die es in keiner Datenquelle eine Übersetzung gibt.
 */
export const de: Record<string, string> = {
  // ─── Navigation und Kopfzeile ───────────────────────────────────────────────
  "Home":            "Startseite",
  "Market":          "Markt",
  "Farm Efficiency": "Farm-Effizienz",
  "Warframe Stats":  "Warframe-Werte",
  "Platinum Market": "Platin-Markt",
  "Last Update:":    "Letztes Update:",
  "24 H":            "24 H",

  // ─── Einstellungen ──────────────────────────────────────────────────────────
  "Settings":   "Einstellungen",
  "LANGUAGE":   "SPRACHE",
  "Interface":  "Oberfläche",
  "Item names": "Item-Namen",
  "Item names stay English by default - that is how they are traded.":
    "Item-Namen bleiben standardmäßig englisch - unter diesen Namen wird gehandelt.",

  // ─── Zeiträume und Filter ───────────────────────────────────────────────────
  // 24H/48H bleiben gleich, 7D/14D/30D/90D werden zu Tagen.
  "7D":  "7T",
  "14D": "14T",
  "30D": "30T",
  "90D": "90T",
  "Last 24 hours": "Letzte 24 Stunden",
  "Last 48 hours": "Letzte 48 Stunden",
  "Last 7 days":   "Letzte 7 Tage",
  "Last 14 days":  "Letzte 14 Tage",
  "Last 30 days":  "Letzte 30 Tage",
  "Last 90 days":  "Letzte 90 Tage",
  "PERIOD":     "ZEITRAUM",
  "CATEGORY":   "KATEGORIE",
  "SELECTION":  "AUSWAHL",
  "Selection":  "Auswahl",
  "REFINEMENT": "REFINEMENT",
  "SOURCE":     "QUELLE",
  "SORTING":    "SORTIERUNG",
  "RANK":       "RANG",
  "All":        "Alle",

  // ─── Kategorien (Kanonwerte aus classify_item_by_tags) ──────────────────────
  "Warframes":        "Warframes",
  "Mods":             "Mods",
  "Weapons":          "Waffen",
  "Relics":           "Relics",
  "Arcanes":          "Arcanes",
  "Misc":             "Sonstiges",
  "Prime":            "Prime",
  "Non-Prime":        "Nicht-Prime",
  "All Misc":         "Alle Sonstigen",
  "Fish":             "Fische",
  "Skins & Helmets":  "Skins & Helme",
  "Scenes":           "Szenen",
  "Gems & Resources": "Edelsteine & Ressourcen",
  "Ayatan":           "Ayatan",
  "Necramech":        "Necramech",
  "Other":            "Sonstige",

  // ─── Allgemeines ────────────────────────────────────────────────────────────
  "LOADING…":            "LADEN…",
  "LOADING CATEGORIES…": "KATEGORIEN LADEN…",
  "LOADING WARFRAMES…":  "WARFRAMES LADEN…",
  "SEARCHING…":          "SUCHE…",
  "No data":             "Keine Daten",
  "Try again":           "Erneut versuchen",
  "Back to overview":    "Zurück zur Übersicht",
  "Select an item":      "Item auswählen",
  "%d items":            "%d Items",
  "Trades":              "Trades",
  "TRADES":              "TRADES",
  "ITEM":                "ITEM",
  "Item":                "Item",
  "PRICE":               "PREIS",
  "Category":            "Kategorie",
  "Type":                "Typ",
  "Avg":                 "Ø",
  "Min":                 "Min",
  "Max":                 "Max",
  "Vol":                 "Vol",
  "VOL":                 "VOL",
  "Drop%":               "Drop%",
  "Rank %d":             "Rang %d",
  "View on warframe.market - opens a new tab":
    "Auf warframe.market ansehen - öffnet einen neuen Tab",

  // ─── Suche ──────────────────────────────────────────────────────────────────
  "Search item…":                "Item suchen…",
  "RECENTLY SEARCHED":           "ZULETZT GESUCHT",
  "Type at least 2 characters…": "Mindestens 2 Zeichen eingeben…",
  "No matches for “%s”":         "Keine Treffer für „%s“",
  "Lowest sell offer - no trades in the last 48 hours":
    "Niedrigstes Verkaufsangebot - kein Handel in den letzten 48 Stunden",
  "Last traded on %s - no trades in the last 48 hours":
    "Letzter Handel am %s - kein Handel in den letzten 48 Stunden",

  // ─── Startseite ─────────────────────────────────────────────────────────────
  "BIGGEST PRICE GAIN":  "STÄRKSTER PREISANSTIEG",
  "Biggest price gain":  "Stärkster Preisanstieg",
  "BIGGEST PRICE DROP":  "STÄRKSTER PREISRÜCKGANG",
  "Biggest price drop":  "Stärkster Preisrückgang",
  "WEAKEST GAIN":        "SCHWÄCHSTER ANSTIEG",
  "Weakest gain":        "Schwächster Anstieg",
  "MOST TRADED":         "MEISTGEHANDELT",
  "Most traded":         "Meistgehandelt",
  "MOST EXPENSIVE ITEM": "TEUERSTES ITEM",
  "Most expensive item": "Teuerstes Item",
  "CURRENT PRICE":       "AKTUELLER PREIS",
  "MEDIAN":              "MEDIAN",
  "Median":              "Median",
  "Typical price":       "Typischer Preis",
  "PRICE RANGE":         "PREISSPANNE",
  "Average price":       "Durchschnittspreis",
  "PRICE CHANGE":        "PREISVERÄNDERUNG",
  "Since start of period": "Seit Zeitraumbeginn",
  "PRICE HISTORY":       "PREISVERLAUF",
  "Unit of change":      "Einheit der Veränderung",
  "Change in percent":   "Veränderung in Prozent",
  "Change in platinum":  "Veränderung in Platin",
  "Number of trades":    "Anzahl Trades",
  "thin data":           "dünne Datenlage",
  "Only %d trades - figure is not very reliable":
    "Nur %d Trades - Wert wenig belastbar",
  "Trades at the last against trades at the first point of the period":
    "Trades am letzten gegen Trades am ersten Punkt des Zeitraums",
  "Change in trades, last against first point of the period":
    "Veränderung der Trades, letzter gegen ersten Punkt des Zeitraums",
  "%s - open detail page": "%s - Detailseite öffnen",

  // ─── Markt (Item-Katalog) ───────────────────────────────────────────────────
  "Category Browser":                    "Item-Katalog",
  "No data available for this category": "Keine Daten verfügbar für diese Kategorie",

  // ─── Item-Seite ─────────────────────────────────────────────────────────────
  "Item not found":          "Item nicht gefunden",
  "OFFERED FROM":            "ANGEBOT AB",
  "Lowest offer":            "Niedrigstes Angebot",
  "Lowest offer, rank %d":   "Niedrigstes Angebot, Rang %d",
  "Average of the last 24h": "Durchschnitt der letzten 24h",
  "Average of the last 48h": "Durchschnitt der letzten 48h",
  "CHANGE 24 H":             "VERÄNDERUNG 24 H",
  "Against 24–48h before":   "Gegenüber 24–48h davor",
  "PRICE RANGE 48 H":        "PREISSPANNE 48 H",
  "difference":              "Differenz",
  "TRADE VOLUME":            "HANDELSVOLUMEN",
  "%s in 48h":               "%s in 48h",
  "DUCAT EFFICIENCY":        "DUCAT-EFFIZIENZ",
  "₱ per ducat · %d ducats": "₱ pro Ducat · %d Ducats",
  "no trades in 48h":        "keine Trades in 48h",
  "last traded %d min ago":  "zuletzt gehandelt vor %d Min",
  "last traded %d h ago":    "zuletzt gehandelt vor %d Std",
  "last traded %d days ago": "zuletzt gehandelt vor %d Tagen",
  "no trades, lowest offer": "kein Handel, niedrigstes Angebot",
  "Price history":           "Preisverlauf",
  "hourly resolution":       "stündliche Auflösung",
  "daily resolution":        "tägliche Auflösung",
  "Drop sources":            "Drop-Quellen",
  "No drop sources known":   "Keine Drop-Quellen bekannt",
  "%d sources":              "%d Quellen",
  "RELIC":                   "RELIC",
  "RELICS":                  "RELICS",
  "ENEMIES":                 "GEGNER",
  "MISSIONS":                "MISSIONEN",
  "RARITY":                  "SELTENHEIT",
  "CHANCE":                  "CHANCE",
  "Relic contents":          "Relic-Inhalt",
  "%d possible rewards":     "%d mögliche Belohnungen",
  "INTACT":                  "INTACT",
  "RADIANT":                 "RADIANT",
  "AVERAGE VALUE":           "DURCHSCHNITTSWERT",
  "DUCATS":                  "DUCATS",
  "Set & parts":             "Set & Einzelteile",
  "%d parts":                "%d Teile",
  "SUM OF PARTS":            "SUMME TEILE",
  "SET PRICE":               "SET-PREIS",
  "DIFFERENCE":              "DIFFERENZ",
  "A positive difference means the set trades higher than the sum of its parts.":
    "Positive Differenz = das Set wird teurer gehandelt als die Summe seiner Teile.",

  // ─── Diagramm ───────────────────────────────────────────────────────────────
  "Moving average":   "Gleitender Durchschnitt",
  "Min–Max":          "Min–Max",
  "Donchian channel": "Donchian-Kanal",
  "Donchian":         "Donchian",
  "Candlesticks":     "Candlesticks",
  "Open→Close":       "Open→Close",
  "Platinum":         "Platin",
  "Not enough trade data for a chart in this period":
    "Zu wenig Handelsdaten für einen Verlauf in diesem Zeitraum",
  "No data available for this item yet":
    "Für dieses Item liegen noch keine Daten vor",
  "A single outlier would flatten the whole chart - the scale is capped for that reason.":
    "Ein einzelner Ausreißer würde den gesamten Verlauf platt drücken - die Skala ist deshalb begrenzt.",
  "· scale capped, outlier up to %s": "· Skala gekappt, Ausreißer bis %s",

  // ─── Farm-Effizienz ─────────────────────────────────────────────────────────
  "Intact":         "Intact",
  "Exceptional":    "Exceptional",
  "Flawless":       "Flawless",
  "Radiant":        "Radiant",
  "Enemy drop":     "Gegner-Drop",
  "Best":           "Bestes",
  "Drop chance":    "Drop-Chance",
  "Value (₱)":      "Wert (₱)",
  "Value × chance": "Wert × Chance",
  "All sources":    "Alle Quellen",
  "Relics only":    "Nur Relics",
  "Enemies only":   "Nur Gegner",
  "Sorted by %s · Refinement: %s": "Sortiert nach %s · Refinement: %s",
  "No items with drop data for this filter":
    "Keine Items mit Drop-Daten für diese Filterung",
  "+%d more sources": "+%d weitere Quellen",
  "PRICE (₱)":   "PREIS (₱)",
  "DROP CHANCE": "DROP-CHANCE",
  "VALUE/DROP":  "WERT/DROP",
  "SOURCES":     "QUELLEN",
  "MISSION":     "MISSION",
  "ENEMY":       "GEGNER",

  // ─── Warframe-Werte ─────────────────────────────────────────────────────────
  "Warframe base values":              "Warframe-Basiswerte",
  "Warframe base values at rank 30":   "Warframe-Basiswerte auf Rang 30",
  "All values at rank 30":             "Alle Werte auf Rang 30",
  "Warframe data unavailable":         "Warframe-Daten nicht verfügbar",
  "The overview could not be loaded.": "Die Übersicht konnte nicht geladen werden.",
  "%d Warframes in total":    "Insgesamt %d Warframes",
  "%d of %d Warframes":       "%d von %d Warframes",
  "No Warframe matches “%s”": "Kein Warframe passt zu „%s“",
  "Search Warframe…":         "Warframe suchen…",
  "Search Warframe":          "Warframe suchen",
  "Number display":           "Anzeige der Zahlen",
  "Every number as distance from the median of the current selection":
    "Jede Zahl als Abstand zum Median der aktuellen Auswahl",
  "Absolute values at rank 30": "Absolute Werte auf Rang 30",
  "NAME": "NAME",
  // Spaltenköpfe: die Umbrüche (\n) sind gesetzt, nicht dem Zufall überlassen.
  // Die Breiten in WF_COLUMNS sind auf die jeweils längere der beiden Sprachen
  // gerechnet - wer hier übersetzt, misst dort nach.
  "HEALTH":                       "LEBEN",
  "ARMOR":                        "RÜSTUNG",
  "DAMAGE\nREDUCTION":            "SCHADENS-\nREDUKTION",
  "EHP":                          "EHP",
  "SHIELDS":                      "SCHILDE",
  "ENERGY":                       "ENERGIE",
  "STARTING\nENERGY":             "START-\nENERGIE",
  "SPRINT":                       "SPRINT",
  "MAXIMUM\nOVERSHIELDS":         "MAXIMALE\nÜBERSCHILDE",
  "EHP +\nSHIELDS":               "EHP +\nSCHILDE",
  "EHP + SHIELDS &\nOVERSHIELDS": "EHP + SCHILDE &\nÜBERSCHILDE",
  "Health at rank 30":  "Lebenspunkte auf Rang 30",
  "Armor at rank 30":   "Rüstung auf Rang 30",
  "Armor ÷ (armor + 300) - share of damage the armor absorbs":
    "Rüstung ÷ (Rüstung + 300) - Anteil des Schadens, den die Rüstung abfängt",
  "Effective hit points: health × (1 + armor ÷ 300). Shields and overshields not included":
    "Effektive Lebenspunkte: Leben × (1 + Rüstung ÷ 300). Schilde und Überschilde nicht enthalten",
  "Shields at rank 30":         "Schilde auf Rang 30",
  "Energy capacity at rank 30": "Energiekapazität auf Rang 30",
  "Energy at mission start - a separate value per Warframe, not half the capacity":
    "Energie beim Missionsstart - ein eigener Wert je Warframe, nicht die halbe Kapazität",
  "Sprint speed": "Sprintgeschwindigkeit",
  "1200 for everyone, 2400 for Harrow. No shields means no overshields":
    "1200 für alle, 2400 für Harrow. Ohne Schilde auch keine Überschilde",
  "Effective hit points + shields. Armor does not apply to shields, they are added raw":
    "Effektive Lebenspunkte + Schilde. Rüstung wirkt nicht auf Schilde, sie werden roh addiert",
  "Effective hit points + shields + overshields":
    "Effektive Lebenspunkte + Schilde + Überschilde",
  "%sGreen%s: more than 10 % above the median · ":
    "%sGrün%s: mehr als 10 % über dem Median · ",
  "%sRed%s: more than 10 % below": "%sRot%s: mehr als 10 % darunter",
  "The median is formed column by column over the selected group and therefore describes no real Warframe. The search does not change it.":
    "Der Median wird spaltenweise über die gewählte Auswahl gebildet und beschreibt deshalb keinen realen Warframe. Die Suche verändert ihn nicht.",
  "Clicking a cell copies its value to the clipboard.":
    "Ein Klick auf eine Zelle kopiert ihren Wert in die Zwischenablage.",
  "EHP = health × (1 + armor ÷ 300)": "EHP = Leben × (1 + Rüstung ÷ 300)",
  "Effective hit points, without shields and overshields":
    "Effektive Lebenspunkte, ohne Schilde und Überschilde",
  "Base values from %s, rank-30 growth and starting energy from %s":
    "Basiswerte aus dem %s, Rang-30-Wachstum und Startenergie aus dem %s",
  "Warframe Wiki": "Warframe-Wiki",

  // ─── Fußzeile ───────────────────────────────────────────────────────────────
  "Imprint": "Impressum",
  "Privacy": "Datenschutz",
  "Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks. All rights are reserved worldwide. This site has no official link with Digital Extremes Ltd or Warframe. All artwork, screenshots, characters or other recognizable features of the intellectual property relating to these trademarks are likewise the intellectual property of Digital Extremes Ltd.":
    "Digital Extremes Ltd, Warframe und das Warframe-Logo sind eingetragene Marken. Alle Rechte weltweit vorbehalten. Diese Seite steht in keiner offiziellen Verbindung zu Digital Extremes Ltd oder Warframe. Sämtliche Grafiken, Screenshots, Charaktere und andere wiedererkennbare Merkmale des geistigen Eigentums an diesen Marken sind ebenfalls geistiges Eigentum von Digital Extremes Ltd.",
};
