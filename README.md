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
- Preisverlauf über 48 h bis 90 Tage mit Median, gleitendem Durchschnitt, Min–Max-Band,
  Donchian-Kanal, optionalen Candlesticks und Trades-Spur
- Kennzahlen: aktueller Preis, 24-h-Veränderung, Spanne mit Spread, Volumen, Ducat-Effizienz
- Rang-Umschalter für Mods und Arcanes (Preise unterscheiden sich je Rang deutlich)
- **Drop-Quellen** gruppiert nach Relics, Gegnern und Missionen — bei Relics mit Chance je
  Refinement-Stufe (Intact / Exceptional / Flawless / Radiant)
- **Relic-Inhalt** bei Relic-Items: alle enthaltenen Items mit Chance, Preis und erwartetem Wert
- **Set ↔ Einzelteile**: Summe der Teile gegen den Set-Preis, inklusive Differenz

**Dashboard** — stärkster Preisanstieg, stärkster Rückgang, meistgehandelt und teuerstes Item,
über Zeiträume von 24 h bis 90 Tagen und nach Kategorie filterbar. Ein Umschalter wechselt in
allen vier Ansichten zwischen Prozent und absolutem Wert — Platin bei den Preisansichten, Anzahl
Trades bei „Meistgehandelt". Die Listen kommen vorberechnet aus der Datenbank und antworten in
wenigen Millisekunden.

**Markt** — Item-Katalog über alle gehandelten Items, sortierbar nach Preis, Volumen und
Drop-Chance.

**Farm-Effizienz** — Items sortiert nach Wert × Drop-Chance: was lohnt sich zu farmen.

**Warframe-Werte** (`/warframes`) — Basiswerte aller 117 Warframes auf Rang 30: Leben, Rüstung,
Schadensreduktion, effektive Lebenspunkte, Schilde, Energie, Startenergie, Sprint, Überschilde
und beide EHP-Werte mit Schilden. Suchbar, sortierbar, umschaltbar zwischen allen Frames, nur
Prime und nur Nicht-Prime — mit einer angehefteten Medianzeile als Vergleichsmaßstab, die der
Auswahl folgt. Werte über 10 % vom Median stehen grün, darunter rot. Ein Umschalter zeigt statt
der Werte den Abstand zum Median, und der Hover hebt Zeile und Spalte zugleich hervor und rahmt
die Zelle, in der sie sich treffen.

**Zwei Sprachen** — Oberfläche und Item-Namen lassen sich über das Zahnrad im Header getrennt
auf Deutsch oder Englisch stellen. Die Oberfläche folgt beim ersten Besuch der Browsersprache,
Item-Namen bleiben englisch, weil unter diesen Namen gehandelt wird. Beide Namen kommen in
derselben API-Antwort, das Umschalten lädt also nichts nach — und die Suche findet ein Item
unter beiden Namen („Serration" wie „Einkerbung").

## 📊 Datenqualität

warframe.market-Daten sind Nutzerangaben, keine Ingame-Trades — jeder kann ein Item zu einem
beliebigen Preis einstellen. VoidWatch filtert Preise, die weit vom Median des Items abweichen,
und gewichtet Ranglisten nach Handelsvolumen: ein Ausschlag über drei Trades steht hinter einer
kleineren Bewegung über zweitausend. Angezeigt wird immer der echte Wert, dünne Datenlagen
werden markiert.

Die Preisveränderung vergleicht Anfang und Ende des Zeitraums, wobei jedes Ende so viele Buckets
umfasst, bis mindestens fünf Trades zusammenkommen — ein einzelner Fantasiepreis am Rand kann die
Kennzahl damit nicht mehr bestimmen. Items ganz ohne Handel zeigen statt eines Preises das
niedrigste Verkaufsangebot, getrennt gekennzeichnet: ein Angebot ist kein Handelspreis.

## 🛠 Tech Stack

- **Frontend**: React 19 + Vite + TypeScript, Inline-Styles über zentrale Design-Tokens,
  eigener Mini-Router (keine Routing-Dependency)
- **Backend**: Python + FastAPI
- **Datenbank**: PostgreSQL
- **Datenquellen**: [warframe.market](https://warframe.market) API,
  [Warframe Public Export Plus](https://github.com/calamity-inc/warframe-public-export-plus)
  und für die Warframe-Übersicht zusätzlich das Datenmodul des
  [Warframe-Wikis](https://wiki.warframe.com/w/Module:Warframes/data) — das Wachstum bis Rang 30
  und die Startenergie stehen in keinem der beiden Exporte

## 🔄 Datenaktualisierung

Ein täglicher Sync (08:00) holt Statistiken für alle ~3.800 handelbaren Items (stündlich für die
letzten 48 h, täglich für 90 Tage), aktualisiert die Item-Metadaten aus dem Public Export, holt
Angebotspreise für Items ohne Handel und berechnet Drop-Quellen sowie die Ranglisten der
Startseite neu. Laufzeit rund 35 Minuten. Ein stündlicher Job prüft auf neue Warframe-Builds.

Aller Verkehr zu warframe.market läuft über einen gemeinsamen Ausgang mit eigenem User-Agent und
einer globalen Drosselung auf die dort veröffentlichten 3 Anfragen pro Sekunde.

---

Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks. All rights are
reserved worldwide. This site has no official link with Digital Extremes Ltd or Warframe.
