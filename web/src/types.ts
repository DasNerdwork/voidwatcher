export interface ItemData {
  wiki: {
    unique_name?: string
    name_en?: string
    name_de?: string
    export_type?: string
    category?: string
    raw?: Record<string, any>
  }[]
  market: {
    market_name?: string
    market_slug?: string
    last_updated?: string
    avg_price?: number
    min_price?: number
    max_price?: number
    volume?: number
    thumb_path?: string | null
    image_path?: string | null
  }[]
}

export interface SearchResults {
  query: string
  results: Array<{
    name: string
    slug: string
    avg_price: number
    volume: number
    thumb_path?: string | null
  }>
}

// Used by /api/top — all three lists (top_performer, top_seller, top_traded)
export interface TopItem {
  item_name:   string
  datetime:    string
  avg_price:   number
  min_price:   number
  max_price:   number
  volume:      number
  change_pct:  number | null  // % change vs previous window; null if no prior data
  max_rank?:   number | null  // Mod-Rang (z.B. 10 für R10 Mods, 5 für Arcanes, null sonst)
  thumb_path?: string | null  // /images/thumbs/{slug}.avif — für Tabellen & Listen
  image_path?: string | null  // /images/{slug}.avif         — für Detailseiten
}