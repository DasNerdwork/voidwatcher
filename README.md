# VoidWatch

**VoidWatch** ist ein Dashboard für Warframe-Marktdaten. Es verfolgt Platinpreise und
Handelsvolumen von warframe.market und verknüpft sie mit den Item- und Drop-Daten aus dem
Warframe Public Export Plus. So zeigt eine Seite, was ein Item wert ist und woher es kommt.

## Webzugriff

- [voidwatch.dasnerdwork.net](https://voidwatch.dasnerdwork.net) (aktueller Build)
- [voidwatcher.pages.dev](https://voidwatcher.pages.dev) (Cloudflare Pages, deprecated)

## Features

**Item-Suche.** Autocomplete im Header mit Icon, Kategorie und Preis. Zuletzt gesuchte Items
bleiben lokal gespeichert. Die Suche läuft über Namen und Slugs und findet damit auch Sets
und Relics.

**Item-Detailseiten** (`/item/{slug}`)

- Preisverlauf über 48 h bis 90 Tage mit Median, gleitendem Durchschnitt, Min-Max-Band,
  Donchian-Kanal, optionalen Candlesticks und Trades-Spur
- Kennzahlen zu aktuellem Preis, 24-h-Veränderung, Spanne mit Spread, Volumen und
  Ducat-Effizienz
- Rang-Umschalter für Mods und Arcanes, deren Preise sich je Rang deutlich unterscheiden
- Drop-Quellen gruppiert nach Relics, Gegnern und Missionen, bei Relics mit Chance je
  Refinement-Stufe (Intact / Exceptional / Flawless / Radiant)
- Bei Relic-Items der Relic-Inhalt, also alle enthaltenen Items mit Chance, Preis und
  erwartetem Wert
- Vergleich zwischen Set und Einzelteilen, mit Summe der Teile, Set-Preis und Differenz

**Dashboard.** Stärkster Preisanstieg, stärkster Rückgang, meistgehandeltes und teuerstes
Item, filterbar nach Kategorie und über Zeiträume von 24 h bis 90 Tagen. Ein Umschalter
wechselt in allen vier Ansichten zwischen Prozent und absolutem Wert, also Platin bei den
Preisansichten und Anzahl Trades bei „Meistgehandelt". Die Listen kommen vorberechnet aus
der Datenbank und antworten in wenigen Millisekunden.

**Markt.** Item-Katalog über alle gehandelten Items, sortierbar nach Preis, Volumen und
Drop-Chance.

**Farm-Effizienz.** Items sortiert nach Wert × Drop-Chance, also danach, was sich zu
farmen lohnt.

**Warframe-Werte** (`/warframes`). Basiswerte aller 117 Warframes auf Rang 30, darunter
Leben, Rüstung, Schadensreduktion, effektive Lebenspunkte, Schilde, Energie, Startenergie,
Sprint, Überschilde und beide EHP-Werte mit Schilden. Die Tabelle ist suchbar, sortierbar
und umschaltbar zwischen allen Frames, nur Prime und nur Nicht-Prime. Als Vergleichsmaßstab
hängt eine Medianzeile fest unter dem Tabellenkopf und passt sich der Auswahl an. Werte mit
mehr als 10 % Abstand zum Median sind eingefärbt, grün darüber, rot darunter. Ein Umschalter
zeigt statt der Werte den Abstand zum Median. Beim Hover werden Zeile und Spalte zugleich
hervorgehoben, und die Zelle an ihrem Schnittpunkt bekommt einen Rahmen.

**Zwei Sprachen.** Oberfläche und Item-Namen lassen sich über das Zahnrad im Header
getrennt auf Deutsch oder Englisch stellen. Die Oberfläche folgt beim ersten Besuch der
Browsersprache. Item-Namen bleiben standardmäßig englisch, weil unter diesen Namen
gehandelt wird. Beide Namen kommen in derselben API-Antwort, das Umschalten lädt also
nichts nach, und die Suche findet ein Item unter beiden Namen („Serration" wie
„Einkerbung").

## Datenqualität

warframe.market-Daten sind Nutzerangaben. Jeder kann ein Item zu einem beliebigen Preis
einstellen, und ob ein Handel wirklich so stattgefunden hat, prüft niemand. VoidWatch
filtert deshalb Preise, die weit vom Median des Items abweichen, und gewichtet Ranglisten
nach Handelsvolumen. Ein Ausschlag über drei Trades steht damit hinter einer kleineren
Bewegung über zweitausend. Angezeigt wird immer der echte Wert, dünne Datenlagen werden
markiert.

Die Preisveränderung vergleicht Anfang und Ende des Zeitraums. Beide Enden umfassen dabei
so viele Buckets, bis mindestens fünf Trades zusammenkommen, damit ein einzelner
Fantasiepreis am Rand die Kennzahl nicht bestimmen kann. Items ganz ohne Handel zeigen
statt eines Preises das niedrigste Verkaufsangebot und sind entsprechend gekennzeichnet,
denn ein Angebot ist kein Handelspreis.

## Tech Stack

- **Frontend**: React 19 + Vite + TypeScript, Inline-Styles über zentrale Design-Tokens,
  eigener Mini-Router (keine Routing-Dependency)
- **Backend**: Python + FastAPI
- **Datenbank**: PostgreSQL
- **Datenquellen**: [warframe.market](https://warframe.market) API,
  [Warframe Public Export Plus](https://github.com/calamity-inc/warframe-public-export-plus)
  und für die Warframe-Übersicht zusätzlich das Datenmodul des
  [Warframe-Wikis](https://wiki.warframe.com/w/Module:Warframes/data), weil das Wachstum
  bis Rang 30 und die Startenergie in keinem der beiden Exporte stehen

## Datenaktualisierung

Ein täglicher Sync um 08:00 holt Statistiken für alle rund 3.800 handelbaren Items
(stündlich aufgelöst für die letzten 48 h, täglich für 90 Tage), aktualisiert die
Item-Metadaten aus dem Public Export, holt Angebotspreise für Items ohne Handel und
berechnet Drop-Quellen sowie die Ranglisten der Startseite neu. Das dauert rund
35 Minuten. Ein stündlicher Job prüft auf neue Warframe-Builds.

Aller Verkehr zu warframe.market läuft über einen gemeinsamen Ausgang mit eigenem
User-Agent und einer globalen Drosselung auf die dort veröffentlichten 3 Anfragen pro
Sekunde.

---

Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks. All rights
are reserved worldwide. This site has no official link with Digital Extremes Ltd or
Warframe.
