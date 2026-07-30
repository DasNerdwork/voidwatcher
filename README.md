# VoidWatch

**VoidWatch** ist ein Dashboard für Warframe-Marktdaten. Es verfolgt Platinpreise und
Handelsvolumen von warframe.market und verknüpft sie mit den Item- und Drop-Daten aus dem
Warframe Public Export Plus, damit sichtbar wird, was ein Item wert ist *und* woher es kommt.

## 🌐 Webzugriff

- [voidwatch.dasnerdwork.net](https://voidwatch.dasnerdwork.net) — aktueller Build
- [voidwatcher.pages.dev](https://voidwatcher.pages.dev) — Cloudflare Pages (Deprecated)

## 📦 Features

**Item-Suche** — Autocomplete im Header mit Icon, Kategorie und Preis; zuletzt gesuchte Items
bleiben lokal gespeichert. Sucht über Namen *und* Slugs, findet damit auch Sets und Relics.

**Item-Detailseiten** (`/item/{slug}`)
- Preisverlauf über 48 h bis 90 Tage mit Donchian-Kanal, optionalen Candlesticks und Volumenspur
- Kennzahlen: aktueller Preis, 24-h-Veränderung, Spanne mit Spread, Volumen, Ducat-Effizienz
- Rang-Umschalter für Mods und Arcanes (Preise unterscheiden sich je Rang deutlich)
- **Drop-Quellen** gruppiert nach Relics, Gegnern und Missionen — bei Relics mit Chance je
  Refinement-Stufe (Intact / Exceptional / Flawless / Radiant)
- **Relic-Inhalt** bei Relic-Items: alle enthaltenen Items mit Chance, Preis und erwartetem Wert
- **Set ↔ Einzelteile**: Summe der Teile gegen den Set-Preis, inklusive Differenz

**Dashboard** — stärkster Preisanstieg, stärkster Rückgang, meistgehandelt und teuerstes Item,
über Zeiträume von 24 h bis 90 Tagen und nach Kategorie filterbar. Die Veränderung lässt sich
zwischen Prozent und Platin umschalten; bei „Meistgehandelt" steht stattdessen die Entwicklung
der Handelsaktivität.

**Market** — Category Browser über alle gehandelten Items, sortierbar nach Preis, Volumen
und Drop-Chance.

**Movers** — stärkste Preisanstiege und -rückgänge sowie die stabilsten Items.

**Farm Value** — Items sortiert nach Wert × Drop-Chance: was lohnt sich zu farmen.

## 📊 Datenqualität

warframe.market-Daten sind Nutzerangaben, keine Ingame-Trades — jeder kann ein Item zu einem
beliebigen Preis einstellen. VoidWatch filtert Preise, die weit vom Median des Items abweichen,
und gewichtet Ranglisten nach Handelsvolumen: ein Ausschlag über drei Trades steht hinter einer
kleineren Bewegung über zweitausend. Angezeigt wird immer der echte Wert, dünne Datenlagen
werden markiert.

## 🛠 Tech Stack

- **Frontend**: React 19 + Vite + TypeScript, Inline-Styles über zentrale Design-Tokens,
  eigener Mini-Router (keine Routing-Dependency)
- **Backend**: Python + FastAPI
- **Datenbank**: PostgreSQL
- **Datenquellen**: [warframe.market](https://warframe.market) API und
  [Warframe Public Export Plus](https://github.com/calamity-inc/warframe-public-export-plus)

## 🔄 Datenaktualisierung

Ein täglicher Sync (08:00) holt Statistiken für alle ~3.800 handelbaren Items (stündlich für die
letzten 48 h, täglich für 90 Tage), aktualisiert die Item-Metadaten aus dem Public Export
und berechnet die Drop-Quellen-Tabelle neu. Ein stündlicher Job prüft auf neue
Warframe-Builds.

---

Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks. All rights are
reserved worldwide. This site has no official link with Digital Extremes Ltd or Warframe.
