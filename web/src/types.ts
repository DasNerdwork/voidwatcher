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
  }[]
}

export interface SearchResults {
  query: string
  results: Array<{
    name: string
    slug: string
    avg_price: number
    volume: number
  }>
}

// Used by /api/top — all three lists (top_performer, top_seller, top_traded)
export interface TopItem {
  item_name: string
  datetime: string
  avg_price: number
  min_price: number
  max_price: number
  volume: number
  change_pct: number | null  // % change vs previous window; null if no prior data
  max_rank?: number | null  // Mod-Rang (1-3 für Mods/Arcanes, null/0 sonst)
}
