// Used by /api/top — all three lists (top_performer, top_seller, top_traded)
export interface TopItem {
  item_name:   string
  slug?:       string
  datetime:    string
  avg_price:   number
  min_price:   number
  max_price:   number
  volume:      number
  change_pct:  number | null  // % change vs previous window; null if no prior data
  max_rank?:   number | null  // Mod-Rang (z.B. 10 für R10 Mods, 5 für Arcanes, null sonst)
  thumb_path?: string | null  // /images/thumbs/{slug}.avif — für Tabellen & Listen
  image_path?: string | null  // /images/{slug}.avif         — für Detailseiten
  // Platin-Differenz derselben beiden Fenster wie change_pct. Kommt immer mit,
  // damit der Einheiten-Umschalter ohne zweite Abfrage funktioniert.
  change_abs?: number | null
  // Volumen-Entwicklung im Zeitraum (erster gegen letzter Bucket) — Anzeige der
  // Ansicht „Meistgehandelt", unabhängig vom %/₱-Umschalter.
  // Letzter Punkt der Zeitreihe = aktueller Preis. avg_price bleibt das Mittel
  // über den Zeitraum; angezeigt wird current_price, damit Preis und Veränderung
  // sich zusammenrechnen lassen.
  current_price?: number | null
  volume_change_abs?: number | null
  volume_change_pct?: number | null
  // Glaubwürdigkeit 0…1 aus dem Handelsvolumen, v/(v+30). Beeinflusst die
  // Sortierung im Backend; im Frontend nur als Hinweis bei dünner Datenlage.
  confidence?: number | null
}

// ─── Suche (/api/item/search) ─────────────────────────────────────────────────

export interface SearchResult {
  name:        string
  slug:        string
  thumb_path?: string | null
  tags?:       string[] | null
  max_rank?:   number | null
  avg_price?:  number | null
  volume?:     number | null
}

// ─── Item-Detailseite (/api/item/{slug}/detail) ───────────────────────────────

export interface ItemDetail {
  id:            string
  name:          string
  slug:          string
  tags:          string[]
  ducats:        number | null
  max_rank:      number | null
  thumb_path:    string | null
  image_path:    string | null
  avg_price_24h: number | null
  min_price_24h: number | null
  max_price_24h: number | null
  volume_24h:    number | null
  last_trade:    string | null
  avg_price_48h: number | null
  min_price_48h: number | null
  max_price_48h: number | null
  volume_48h:    number | null
  change_pct:    number | null
  mod_ranks:     number[] | null   // vorhandene mod_rank-Werte → Rang-Umschalter
  category:      string
  subcategory:   string | null
}

export interface DropSource {
  source_type:             "relic" | "enemy" | "mission"
  relic_era:               string | null
  relic_category:          string | null
  relic_name:              string | null
  droptable_name:          string | null
  droptable_path:          string | null
  rarity:                  string | null
  drop_chance_intact:      number | null
  drop_chance_exceptional: number | null
  drop_chance_flawless:    number | null
  drop_chance_radiant:     number | null
  drop_chance_enemy:       number | null
  drop_chance_best:        number | null
}

export interface RelicContent {
  name:                    string
  slug:                    string
  thumb_path:              string | null
  ducats:                  number | null
  rarity:                  string | null
  drop_chance_intact:      number | null
  drop_chance_exceptional: number | null
  drop_chance_flawless:    number | null
  drop_chance_radiant:     number | null
  avg_price:               number | null
  volume:                  number | null
}

export interface SetPart {
  name:       string
  slug:       string
  thumb_path: string | null
  ducats:     number | null
  is_set:     boolean
  avg_price:  number | null
  volume:     number | null
}

export interface ItemDetailResponse {
  item:           ItemDetail
  drop_sources:   DropSource[]
  relic_contents: RelicContent[]
  set_parts:      SetPart[]
}

// ─── Zeitreihe (/api/item/{slug}/history) ─────────────────────────────────────

export interface HistoryPoint {
  t:         string          // ISO-Timestamp (stündlich) oder ISO-Datum (täglich)
  avg_price: number | null
  min_price: number | null
  max_price: number | null
  volume:    number | null
  // Indikatoren von warframe.market (siehe migrations/003_stats_indicators.sql).
  // NULL, solange ein Item seit der Migration noch nicht gesynct wurde —
  // der Chart blendet die betroffene Serie dann aus.
  open_price:   number | null   // ─┬ Candlesticks
  closed_price: number | null   // ─┘
  donch_top:    number | null   // ─┬ Donchian-Kanal
  donch_bot:    number | null   // ─┘
  median:       number | null   // gespeichert, aktuell nicht dargestellt
  moving_avg:   number | null   // dito
}

export interface HistoryResponse {
  slug:       string
  hours:      number
  mod_rank:   number | null
  resolution: "hour" | "day"
  points:     HistoryPoint[]
}
