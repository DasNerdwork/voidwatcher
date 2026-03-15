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
      background: "rgba(10,12,32,0.82)",
      border: "1px solid rgba(200,168,75,0.22)",
      borderRadius: "8px",
      marginBottom: "28px",
      overflow: "hidden",
      backdropFilter: "blur(10px)",
    }}>
      {/* Header */}
      <div style={{
        padding: "13px 18px",
        borderBottom: "1px solid rgba(200,168,75,0.22)",
        background: "rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "system-ui, -apple-system, sans-serif", fontSize: 11, letterSpacing: "0.01em", color: "#7a6e52", fontWeight: 400, whiteSpace: "nowrap", textTransform: "none" }}>
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
              border: "1px solid rgba(200,168,75,0.22)",
              borderRadius: "2px",
              background: "rgba(0,0,0,0.25)",
              color: "#e8dfc0",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 13,
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#c8a84b")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(200,168,75,0.22)")}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              padding: "10px 20px",
              border: "1px solid #c8a84b",
              borderRadius: "2px",
              background: "rgba(200,168,75,0.09)",
              color: "#c8a84b",
              fontFamily: "system-ui, -apple-system, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.15em",
              cursor: loading || !query.trim() ? "not-allowed" : "pointer",
              transition: "all 0.15s",
            }}
          >
            {loading ? "SUCHE..." : "SUCHEN"}
          </button>
        </div>

        {/* Results */}
        {results && results.results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 11, color: "#7a6e52", fontFamily: "system-ui, -apple-system, sans-serif", marginBottom: 8,
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