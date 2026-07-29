# Voidwatch — Systemübersicht

Marktdaten-Tracker für Warframe-Platinpreise. Aggregiert warframe.market (Preise, Volumen)
mit dem Warframe Public Export Plus (Item-Metadaten, Drop-Tabellen).

## Stack
- **Frontend**: React 19 + Vite (TypeScript) → `web/src/`, Build: `web/dist/`
- **Backend**: FastAPI (`api/main.py`), Port 8090, Systemd: `voidwatch.service`
- **DB**: PostgreSQL 127.0.0.1:5432, DB `voidwatch`, User `voidwatcher`, PW aus `api/.env`
- **Webserver**: nginx, `/etc/nginx/sites-enabled/019-voidwatch`
  → `/api/` proxyt auf 8090, `/images/` aliast auf `images/`, alles andere `try_files $uri /index.html`

## Dateistruktur
```
/hdd1/warframe/voidwatch/
├── api/
│   ├── main.py              # FastAPI-Routen
│   ├── db.py                # ALLE Queries (kein raw SQL woanders)
│   └── .env                 # VW_HOST, VW_PORT, VW_NAME, VW_USER, VW_PASSWORD
├── migrations/              # SQL-Migrationen, aufsteigend nummeriert
├── scripts/
│   ├── sync_api.py          # warframe.market + WFPE Sync  (Cron: täglich 08:00)
│   ├── check_version.py     # Warframe-Buildversion        (Cron: stündlich)
│   ├── precompute_drops.py  # baut item_drop_sources neu   (läuft aus sync_api)
│   └── sync_images.py       # lädt/konvertiert Item-Bilder (läuft aus sync_api)
├── images/                  # {slug}.avif + thumbs/{slug}.avif, von nginx ausgeliefert
├── log/cron.log             # Sync-Log (rotierend)
└── web/
    ├── public/              # Favicons, _redirects (SPA-Fallback für Cloudflare Pages)
    ├── src/
    │   ├── App.tsx          # Header, Nav, Routing-Weiche
    │   ├── router.tsx       # Mini-Router (History-API, keine Dependency)
    │   ├── types.ts         # API-Typen
    │   └── components/
    │       ├── shared.tsx       # Design-Tokens C, Typo-Skala T, segBtn, ItemThumb …
    │       ├── SearchBox.tsx    # Header-Suche mit Autocomplete + Recently Searched
    │       ├── ItemPage.tsx     # Item-Detailseite
    │       ├── ItemChart.tsx    # Preis-/Volumenchart
    │       └── …
    └── dist/                # Build-Output, direkt von nginx ausgeliefert
```

## API-Endpoints
Alle unter `/api`, Antworten via `_ok()` / `_err()` in `main.py`.

| Route | Zweck |
|---|---|
| `GET /api/status` | Sync-Zeitstempel, Warframe-Build, WFPE-Version |
| `GET /api/top?hours=&limit=&tag=&rank_mode=` | Top Performer / Seller / Traded |
| `GET /api/category?tag=all` | Category Browser (alle Items, klassifiziert) |
| `GET /api/item/search?q=` | Autocomplete (Name **und** Slug, min. 2 Zeichen) |
| `GET /api/item/{slug}/detail` | Item + Drop-Quellen + Relic-Inhalt + Set-Teile |
| `GET /api/item/{slug}/history?hours=&mod_rank=` | Zeitreihe für den Chart |
| `GET /api/item/{name}` | Legacy, kombiniert wiki+market — vom Frontend ungenutzt |
| `GET /api/market/volume\|value\|movers\|stable\|drops` | Ranglisten mit Filtern |
| `GET /api/drops/{item_id}` | Drop-Quellen roh |

**Reihenfolge beachten:** `/api/item/search` muss vor `/api/item/{name}` deklariert bleiben,
sonst schluckt der Catch-all die Route.

## DB-Tabellen

| Tabelle | Inhalt |
|---|---|
| `market_items` | warframe.market Items (slug, tags, ducats, max_rank, thumb_path, image_path, raw JSONB) |
| `market_stats_48h` | Stündliche Statistiken, 48h-Fenster |
| `market_stats_90d` | Tägliche Statistiken, 90d-Fenster |
| `item_drop_sources` | Vorberechnete Drop-Quellen: `relic` / `enemy` / `mission` |
| `wfpe_items` | Game-Objekte aus WFPE (JOIN über `market_items.game_ref = unique_name`) |
| `metadata` | Key-Value, u.a. `last_updated` |

### Stats-Tabellen: Schlüssel und Indikatoren

Beide Stats-Tabellen haben **keinen** Primärschlüssel auf `(item_id, ts)`, sondern einen
Unique-Index über `(item_id, ts|day, COALESCE(mod_rank,-1), COALESCE(subtype,''))`.
Grund: die API liefert je Zeitpunkt mehrere Zeilen — eine pro **mod_rank** (Mods/Arcanes)
bzw. **subtype** (z.B. Fischgrößen small/medium/large). Beide sind für die meisten Items NULL
und können deshalb nicht in einen PK. Ohne das gingen Ränge verloren und `ON CONFLICT DO UPDATE`
bricht ab (`command cannot affect row a second time`).

Neben `avg/min/max/volume` werden die Indikatoren gespeichert, die die API mitliefert:
`open_price`, `closed_price` (→ Candlesticks), `donch_top`, `donch_bot` (→ Donchian-Kanal),
`median`, `moving_avg` (gespeichert, aktuell nicht dargestellt).

Der Sync nutzt `ON CONFLICT … DO UPDATE`, nicht `DO NOTHING` — sonst würden bestehende Zeilen
nie mit neuen Spalten nachgefüllt. Die API gibt bei jedem Abruf das volle 90-Tage-Fenster
zurück, die Historie füllt sich dadurch rückwirkend.

## Frontend-Konventionen

**Design-Tokens** in `web/src/components/shared.tsx`: Farben `C`, Typo-Skala `T`,
Filter-Controls `segBtn()` / `segBtnHover()` / `FilterLabel`.

**Typo-Regeln — verbindlich für neue Komponenten:**
1. Nichts unter **11px**. Darunter liest sich Versalsatz als Zeichenfolge statt als Wort.
2. Text nie auf `C.t3` (#7a6e52 = 3,8:1, unter AA-Minimum 4,5:1). Minimum ist `C.t2` (8,1:1).
   `C.t3` bleibt Dekoration vorbehalten (Trennlinien, Achsen).
3. Versal-Sperrung höchstens **0.12em**. Ausnahme: Wortmarke und „LADEN…"-Zustände.

Dokumentierte Ausnahme von Regel 2: die **Rangziffern** der Dashboard-Liste nutzen
Warframes Stufenfarben (Platin › Gold › Silber › Bronze). Bronze liegt bei 5,63:1 —
über dem AA-Minimum, aber unter `C.t2`. Zulässig, weil die Ziffer redundant ist: die
Position in der Liste nennt den Rang ohnehin. Bei solchen Farbskalen gilt zusätzlich:
**die Helligkeit muss durchgehend fallen**, sonst wirkt ein schlechterer Rang heller
als ein besserer (genau dieser Fehler steckte in der ersten Fassung).

Presets: `T.label`, `T.meta`, `T.body`, `T.bodyStrong`, `T.num`, `T.numSmall`, `T.stat`,
`T.hero`, `T.cardTitle`. Styles werden inline gespreadet, kein CSS-Framework.

**Hover — genau zwei Muster, beide in `shared.tsx`:**

| Helfer | Für | Effekt |
|---|---|---|
| `hoverSurface({active, border})` | Buttons, Nav, Suchvorschläge | Fläche `C.hov`, Text `C.t`, ggf. Rahmen `C.b2` |
| `hoverRow` | Tabellenzeilen | nur Fläche `C.hov` |
| `hoverLink(restColor)` / `<TextLink>` | Textlinks (Header, Footer, Fließtext) | `C.gold` + Unterstrich, keine Fläche |

`segBtnHover()` ist nur noch ein Wrapper um `hoverSurface` — nicht neu implementieren.
Jedes klickbare Element braucht eines dieser Muster; vorher hatten „Last Update" im Header
und die Footer-Links gar keinen Hover.

**Zahlenformate — ebenfalls `shared.tsx`:**

- **`plat(v)`** für *jeden* Platinpreis. Rundet auf ganze Zahlen mit Untergrenze 1.
  Halbe Platin gibt es im Spiel nicht — die Nachkommastellen entstehen erst durch die
  volumengewichtete Mittelung und suggerieren eine Genauigkeit, die es nicht gibt.
  Niemals `toFixed()` direkt auf einen Platinwert anwenden.
- **`pctChange(v)`** für Veränderungen in Prozent (`+`/`−`, eine Nachkommastelle).
  Keine Pfeilsymbole — die gesamte App nutzt Vorzeichen.
- Nachkommastellen bleiben richtig bei: Prozentwerten, Drop-Chancen, Ducat-Effizienz,
  „Wert/Drop", Spread-Ratio. Diese laufen nicht über `plat()`.

**Benennung von Kennzahlen:** Überschriften nennen Messgröße und Richtung ausgeschrieben
(„STÄRKSTER PREISANSTIEG", „HANDELSVOLUMEN", „PREISVERÄNDERUNG"), keine englischen
Kürzel wie „Change"/„Range". Unterzeilen benennen den Zeitbezug exakt.

**Jede Zahl der Zeile muss sich mit den anderen zusammenrechnen lassen.** Angezeigter
Preis ist deshalb `current_price` (letzter Punkt der Zeitreihe), nicht `avg_price`
(Mittel über das Fenster): mit dem Mittel stand in der Liste „998 (+524)" bei einem
Verlauf von 501 auf 1025 — beide Zahlen richtig, zusammen unsinnig. Ebenso zeigt die
Kachel „ERÖFFNUNG" den `avg_price` des **ersten** Punktes, nicht dessen `open_price`.
Es gilt: Eröffnung + Preisveränderung = angezeigter Preis.

**Routing**: `web/src/router.tsx`, History-API ohne Dependency. `useRoute()`, `navigate()`,
`<A href>` (fängt nur den einfachen Linksklick ab, Strg/Mittelklick öffnen neue Tabs).
Routen: `/` und `/item/:slug`.

**localStorage-Keys**: `vw:recent-items` (Suche), `vw:chart-series` (Chart-Toggles), `vw:change-metric` (Einheit der Veränderung).

## Datenqualität — verbindlich für neue Abfragen

warframe.market-Daten sind **Nutzerangaben, keine Ingame-Trades**. Jeder kann ein Item zu
einem beliebigen Preis einstellen. Dazu kommt die Frage, welchen Ausschnitt eine Kennzahl
überhaupt beschreibt — vier Regeln, alle in `api/db.py`:

**1 · Plausibilitätsfilter — `_plausible_clause()`**
Schließt Preise aus, die mehr als `PLAUSIBILITY_FACTOR` (20) vom `price_median` des Items
entfernt liegen. Maßstab ist bewusst der Median des Items, keine absolute Grenze: 99 % aller
Beobachtungen liegen unter dem 4,8-fachen ihres Medians, oberhalb von 20× bleiben 81 von
285.461 Zeilen — darunter alle Einträge über 5.000 ₱ (z.B. „Warm Coat" mit 500.067 ₱ bei
einem Median von 10 ₱). Echte Ereignisse wie ein Prime-Unvaulting bewegen sich im
einstelligen Faktor.

`price_median` wird vom Sync über das volle 90-Tage-Fenster vorberechnet
(`refresh_price_reference`, Migration 007) — inline kostet der Median 154 ms. `NULL`
bedeutet „keine Referenz"; der Filter greift dann nicht, denn unbekannt ist nicht
manipuliert.

**Gilt in**: allen Ranglisten und in `get_item_detail`.
**Gilt NICHT in** `get_item_history`: der Graph soll zeigen, *dass* ein Ausreißertrade
stattfand. Dort begrenzt der IQR-Zaun in `ItemChart.tsx` nur die Achse und weist mit
„Skala gekappt" darauf hin.

**2 · Glaubwürdigkeitsgewichtung — `_credibility()`**
Shrinkage `v / (v + CREDIBILITY_M)` mit m = 30: 10 Trades → 25 %, 20 → 40 %, 100 → 77 %,
2.000 → 99 %. Dazu `MIN_VOLUME = 5` als harte Untergrenze für die Ranglisten.

m war zuvor 10; damit lagen 20 und 2.000 Trades nur den Faktor 1,5 auseinander, jetzt 2,5.
Wer die Konstante ändert, muss die Schwelle für den Hinweis „dünne Datenlage" in
`DashboardPage.tsx` mitziehen — sie steht bei `confidence < 0,25` und meint „rund zehn
Trades", nicht einen festen Zahlenwert.

Der Faktor wirkt **nur auf die Sortierung**. Der angezeigte Wert bleibt immer der echte —
eine geschönte Zahl wäre schlimmer als das Problem. Entscheidend ist, dass die Liste die
API-Reihenfolge übernimmt: eine clientseitige Nachsortierung nach rohem Prozentwert hatte
die Gewichtung schon einmal wirkungslos gemacht.

Frühere Formel war `LN(volume + 1)`; die ist unbegrenzt und verstärkte dünne Einträge
zusätzlich, statt sie abzuschwächen.

**3 · Rand gegen Rand — `_edge_cte()`**
`change_pct` / `change_abs` vergleichen den **letzten mit dem ersten Bucket** des
Zeitraums, also genau die beiden Enden der Linie in `ItemChart`. Die Bucket-Preise
entstehen über `_vw_avg`, identisch zu `get_item_history` — die Kennzahl ist damit im
Graphen ablesbar.

Vorgänger war ein Hälften-Vergleich (zweite Hälfte des Zeitraums gegen die erste,
beide volumengewichtet). Statistisch robuster, praktisch unbrauchbar: Meso E1 Relic
lief über 7 Tage von 8 auf 70 ₱ und die Kennzahl meldete +49, weil sie zwei
Halbfenster-Mittel verglich. Niemand kann das aus dem Bild nachrechnen.

Robustheit kommt stattdessen aus der Sortierung (Glaubwürdigkeitsgewicht) und aus
dem Hinweis „dünne Datenlage" — **nicht** aus einer Glättung, die die Zahl vom
Graphen ablöst. Bei nur einem Bucket im Fenster bleibt die Vorperiode NULL: „keine
Vergleichsbasis" ist etwas anderes als „unverändert", die Oberfläche zeigt „—".

Analog liefern die Top-Abfragen `volume_change_abs` / `volume_change_pct` — Trades im
letzten gegen Trades im ersten Bucket. Sie stehen in der Ansicht „Meistgehandelt"
anstelle der Preisveränderung, flach und prozentual zugleich, und folgen dem
%/₱-Umschalter bewusst nicht.

**Alle Fenster ankern am jüngsten Datenpunkt** (`MAX(ts)` bzw. `MAX(day)`), nicht an
`NOW()`. Steht der Sync, war der 24H-Graph sonst leer, während die Ranglisten weiter
rechneten, und bei den Tagesdaten liefen Graph und Kennzahl um die Verzögerung
auseinander.

**4 · Prozent oder Platin — `metric` in `/api/top`**
`metric=pct` (Vorgabe) sortiert nach `change_pct × credibility` und verlangt zusätzlich
einen Durchschnittspreis ≥ `MIN_PRICE_FOR_PCT` (2 ₱). Ohne diese Grenze führen Cent-Items
die Liste an: 0,22 → 0,67 ₱ sind +203 %, in Platin aber 0,45 — und nach der Rundung auf
ganze Platin steht dort „1 → 1".

`metric=abs` sortiert nach `change_abs × credibility`, der Platin-Differenz derselben
beiden Fenster. Dort erübrigt sich die Untergrenze, weil ein Cent-Item keine nennenswerte
Differenz erzeugen kann.

Beide Felder kommen **immer** mit, unabhängig von `metric` — das Frontend schaltet ohne
zweite Abfrage um (Umschalter `%` / ₱ im Listenkopf, `vw:change-metric`).

## Deployment
```bash
cd web && npm run build      # dist/ wird direkt von nginx ausgeliefert
systemctl restart voidwatch  # Backend
```

## Sync betreiben
```bash
python3 scripts/sync_api.py                      # voll, ~13 min für 3.800 Items
python3 scripts/sync_api.py --slug ember_prime_set --skip-wfpe   # ein Item, Sekunden
python3 scripts/sync_api.py --dry-run            # ohne Statistiken zu schreiben
```
`--slug` überspringt Housekeeping, precompute_drops, sync_images und den `last_updated`-Stempel
— es ist ein Testpfad, kein Teilsync für den Produktivbetrieb.

## Regeln
- DB-Queries immer über `api/db.py`, kein raw SQL an anderer Stelle
- Schema-Änderungen immer als Datei in `migrations/` **und** in `create_schema()` in `sync_api.py`
  (sonst weicht eine Neuinstallation von der migrierten DB ab)
- PW immer aus `.env`, niemals hardcoden
- Nicht committen: `.agents/`, `export_database_summary.json`, `test.json`, `log/`
