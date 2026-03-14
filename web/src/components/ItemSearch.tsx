import { useState } from "react";
import { ItemCard } from "./ItemCard";
import type { SearchResults } from "../types";

interface ItemSearchProps {
  searchUrl: string;
  itemUrl: string;
}

export const ItemSearch: React.FC<ItemSearchProps> = ({ searchUrl }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`${searchUrl}?q=${encodeURIComponent(query)}`);
      const data: SearchResults = await res.json();
      setResults(data);
    } catch {
      console.error("Fehler bei der Suche");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      marginBottom: 28,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-deep)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.2em", color: "var(--plat)", fontWeight: 700 }}>
          ITEM-SUCHE
        </span>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSearch} style={{ padding: "16px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item suchen (z.B. Ash, Ember, Vulkel)..."
            style={{
              flex: 1,
              padding: "10px 14px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "10px 20px",
              border: "1px solid var(--plat)",
              borderRadius: 4,
              background: "var(--plat-glow)",
              color: "var(--plat)",
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              transition: "all 0.15s",
              boxShadow: "0 0 12px var(--plat-glow)",
            }}
          >
            {loading ? "SUCHE..." : "SUCHEN"}
          </button>
        </div>

        {/* Results */}
        {results && results.results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)", marginBottom: 8,
            }}>
              Ergebnisse:
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
              {results.results.map((result, idx) => (
                <ItemCard
                  key={idx}
                  item={{
                    wiki: [{ unique_name: query, name_en: query, name_de: query, raw: {}, category: "Andere" }],
                    market: [{ market_name: result.name, market_slug: result.slug, last_updated: new Date().toISOString(), avg_price: result.avg_price, min_price: result.avg_price, max_price: result.avg_price, volume: result.volume }]
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
};