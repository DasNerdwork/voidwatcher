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

export interface TopItem {
  item_name: string
  datetime: string
  avg_price: number
  min_price: number
  max_price: number
  volume: number
}