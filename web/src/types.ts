// Used by /api/top - all three lists (top_performer, top_seller, top_traded)
export interface TopItem {
  item_name:   string
  /** Deutscher Item-Name. Die API liefert IMMER beide Sprachen (api/db.py),
      damit die Oberfläche ohne neuen Abruf umschalten kann. */
  item_name_de?: string | null
  slug?:       string
  datetime:    string
  avg_price:   number
  min_price:   number
  max_price:   number
  volume:      number
  change_pct:  number | null  // % change vs previous window; null if no prior data
  max_rank?:   number | null  // Mod-Rang (z.B. 10 für R10 Mods, 5 für Arcanes, null sonst)
  thumb_path?: string | null  // /images/thumbs/{slug}.avif - für Tabellen & Listen
  image_path?: string | null  // /images/{slug}.avif         - für Detailseiten
  // Platin-Differenz derselben beiden Fenster wie change_pct. Kommt immer mit,
  // damit der Einheiten-Umschalter ohne zweite Abfrage funktioniert.
  change_abs?: number | null
  // Volumen-Entwicklung im Zeitraum (erster gegen letzter Bucket) - Anzeige der
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
  // Volumengewichtetes Mittel der Bucket-Mediane von warframe.market - dieselbe
  // Aggregation, die der Chart als Median-Linie zeichnet. Ein Mittel von Medianen,
  // kein Quantil über alle Trades; die Kachel sagt deshalb „typischer Preis".
  median?: number | null
}

// ─── Suche (/api/item/search) ─────────────────────────────────────────────────

export interface SearchResult {
  name:        string
  name_de?:    string | null
  slug:        string
  thumb_path?: string | null
  tags?:       string[] | null
  max_rank?:   number | null
  avg_price?:  number | null
  volume?:     number | null
  // true, wenn avg_price aus sell_price_min stammt (weder frischer Handel noch
  // ein älterer Handelstag). Optisch nicht unterschieden - nur als Tooltip.
  is_offer?:   boolean | null
  // gesetzt, wenn avg_price der letzte Tag MIT Handel ist statt des 48h-Fensters
  // (ISO-Datum). Ebenfalls nur als Tooltip.
  price_day?:  string | null
}

// ─── Item-Detailseite (/api/item/{slug}/detail) ───────────────────────────────

export interface ItemDetail {
  id:            string
  name:          string
  name_de?:      string | null
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
  // Niedrigstes Verkaufsangebot, nur gefüllt bei Items ohne Handelsdaten.
  // Ein Angebot ist kein Handelspreis und wird getrennt ausgewiesen.
  sell_price_min:    number | null
  sell_price_rank:   number | null
  sell_price_status: string | null
  sell_orders_at:    string | null
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
  name_de?:                string | null
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
  name_de?:   string | null
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
  // NULL, solange ein Item seit der Migration noch nicht gesynct wurde -
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

// ─── Warframe-Übersicht (/api/warframes) ──────────────────────────────────────

/** Die Spalten, über die sortiert, eingefärbt und der Median gebildet wird. */
export type WfNumKey =
  | "health" | "armor" | "dr_pct" | "effective_health" | "shield"
  | "energy" | "start_energy" | "sprint" | "max_overshield"
  | "ehp_shield" | "ehp_shield_overshield"

export interface WarframeStat {
  name:         string
  unique_name:  string
  is_prime:     boolean
  // Alle Werte auf Rang 30. start_energy ist die echte Startenergie des Frames,
  // KEIN Anteil der Kapazität - bei 107 von 119 Frames sind das verschiedene
  // Zahlen (Ash startet mit 50 von 150).
  health:                number
  armor:                 number
  dr_pct:                number   // Rüstung/(Rüstung+300) × 100
  effective_health:      number   // Leben × (1 + Rüstung/300), ohne Schilde
  shield:                number
  energy:                number
  start_energy:          number | null
  sprint:                number
  max_overshield:        number
  ehp_shield:            number
  ehp_shield_overshield: number
  // Detailzeile, aus dem Wiki-Datenmodul
  passive:     string | null
  abilities:   string[]
  polarities:  string[]
  aura:        string | null
  helminth:    string | null      // subsumierbare Fähigkeit
  progenitor:  string | null      // Lich-Element
  introduced:  string | null
  // Marktbezug - nur Prime-Sets sind handelbar, also 50 von 117 Zeilen
  slug:           string | null
  thumb_path:     string | null
  price:          number | null
  price_is_offer: boolean
}

export type WfMedians = Record<WfNumKey, number | null>

export interface WarframesResponse {
  last_updated: string | null
  items:        WarframeStat[]
  // Drei Sätze: ein Prime ist durchweg besser ausgestattet und gehört mit
  // seinesgleichen verglichen, nicht mit den Nicht-Primes.
  medians:      { all: WfMedians; prime: WfMedians; nonprime: WfMedians }
}
