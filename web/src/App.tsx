import { useEffect, useState } from "react";
import { TickerBanner } from "./components/Ticker";
import { CategoryTable } from "./components/CategoryTable";
import { Sparkbar } from "./components/Sparkbar";
import { PlatIcon, SmallPlatIcon, LogoIcon } from "./components/Icons";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DisplayItem {
  item_name: string;
  datetime: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  volume: number;
}

interface ApiResponse {
  last_updated: string;
  top_performer: DisplayItem[];
  top_seller: DisplayItem[];
  top_traded: DisplayItem[];
}

interface CategoryItem {
  name: string;
  slug: string;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  volume: number | null;
  tags: string;
  ducats: string | null;
  category?: string;
}

interface CategoriesOverview {
  name: string;
  slug: string;
  items: CategoryItem[];
}

// ─── API Configuration ─────────────────────────────────────────────────────────
const API_CATEGORIES_URL = "https://voidwatch.dasnerdwork.net/api/category?tag=all&limit=30";

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ["Alle", "Warframes", "Mods", "Waffen", "Relics", "Ressourcen", "Arcanes"];
const HOURS_OPTIONS = [24, 48, 168, 336, 720, 2160];
const HOURS_LABELS: Record<number, string> = {
  24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T",
};

// ─── Main App Component ───────────────────────────────────────────────────────
const App: React.FC = () => {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("Alle");
  const [now, setNow] = useState(new Date());
  const [allCategories, setAllCategories] = useState<CategoriesOverview[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Styles already injected in main.tsx
  useEffect(() => {
    // No-op - styles handled in main.tsx
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch market data
  const fetchMarketData = async (h: number) => {
    setLoading(true);
    try {
      const res = await fetch(`https://voidwatch.dasnerdwork.net/api/top?hours=${h}&limit=10`);
      const json = await res.json();
      setData(json);
    } catch {
      // keep previous data
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMarketData(hours); }, [hours]);

  // Fetch categories data
  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(API_CATEGORIES_URL);
      const json = await res.json();
      setAllCategories(json.categories || []);
    } catch {
      // Keep empty state
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="scanline" style={{ minHeight: "100vh", fontFamily: "var(--font-body)" }}>

      {/* ── Header ── */}
      <header style={{
        background: "var(--bg-deep)",
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
        backdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <LogoIcon />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 900, letterSpacing: "0.2em", color: "var(--plat)", lineHeight: 1 }}>
                VOIDWATCH
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.15em", textTransform: "uppercase", lineHeight: 1, marginTop: 2 }}>
                Platinum Market
              </div>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: "var(--border)", margin: "0 8px" }} />
          {data && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              Sync: <span style={{ color: "var(--text-secondary)" }}>{formatTs(data.last_updated)}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {loading && (
            <div style={{ fontSize: 10, fontFamily: "var(--font-display)", color: "var(--plat-dim)", letterSpacing: "0.15em", animation: "glow-pulse 1s ease infinite" }}>
              LADEN...
            </div>
          )}
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
            {now.toLocaleTimeString("de-DE")}
          </div>
          <div className="status-dot" />
        </div>
      </header>

      {/* ── Ticker ── */}
      {data && <TickerBanner items={data.top_performer} />}

      {/* ── Main Content ── */}
      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 48px" }}>

        {/* ── Time Selector ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.2em", marginRight: 8 }}>ZEITRAUM</span>
          {HOURS_OPTIONS.map((h) => (
            <button key={h} onClick={() => setHours(h)} style={{
              padding: "5px 14px",
              border: hours === h ? "1px solid var(--plat)" : "1px solid var(--border)",
              borderRadius: 4,
              background: hours === h ? "var(--plat-glow)" : "transparent",
              color: hours === h ? "var(--plat)" : "var(--text-muted)",
              fontFamily: "var(--font-display)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.15em",
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: hours === h ? "0 0 12px var(--plat-glow)" : "none",
            }}
              onMouseEnter={e => { if (hours !== h) { (e.target as HTMLElement).style.borderColor = "var(--plat-dim)"; (e.target as HTMLElement).style.color = "var(--text-primary)"; }}}
              onMouseLeave={e => { if (hours !== h) { (e.target as HTMLElement).style.borderColor = "var(--border)"; (e.target as HTMLElement).style.color = "var(--text-muted)"; }}}
            >
              {HOURS_LABELS[h]}
            </button>
          ))}
        </div>

        {/* ── Category Browser ── */}
        <section style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 28,
          overflow: "hidden",
        }}>
          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-deep)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.2em", color: "var(--plat)", fontWeight: 700 }}>
                KATEGORIEN
              </span>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)" }}>
                · {category === "Alle" ? (allCategories?.reduce((acc, cat) => acc + cat.items.length, 0) ?? 0) : (allCategories?.find(c => c.name === category)?.items?.length ?? 0)} Items
              </span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {CATEGORIES.map((cat) => (
                <button key={cat} onClick={() => setCategory(cat)} style={{
                  padding: "4px 12px",
                  border: category === cat ? "1px solid var(--cyan-dim)" : "1px solid var(--border)",
                  borderRadius: 3,
                  background: category === cat ? "#06B6D411" : "transparent",
                  color: category === cat ? "var(--cyan)" : "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  fontWeight: category === cat ? 600 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  letterSpacing: "0.05em",
                }}
                  onMouseEnter={e => { if (category !== cat) (e.target as HTMLElement).style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { if (category !== cat) (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          {categoriesLoading ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>KATEGORIEN LADEN...</div>
            </div>
          ) : (
            <CategoryTable category={category} allCategories={allCategories} />
          )}
        </section>

        {/* ── Market Tables ── */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 20 }}>
            <MarketTable title="Top Performer" subtitle="Stärkste Preisbewegung" rows={data.top_performer} hours={hours} accentColor="var(--up)" />
            <MarketTable title="Top Seller" subtitle="Höchste Durchschnittspreise" rows={data.top_seller} hours={hours} accentColor="var(--plat)" />
            <MarketTable title="Meistgehandelt" subtitle="Höchstes Volumen" rows={data.top_traded} hours={hours} accentColor="var(--cyan)" />
          </div>
        )}
      </main>
    </div>
  );
};

// ─── Market Table Component ────────────────────────────────────────────────────
interface MarketTableProps {
  title: string;
  subtitle: string;
  rows: DisplayItem[];
  hours: number;
  accentColor: string;
}

const MarketTable = ({ title, subtitle, rows, hours, accentColor }: MarketTableProps) => {
  const [sortKey, setSortKey] = useState<"avg_price" | "volume" | "spread">("avg_price");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const hoursLabel = () => {
    const map: Record<number, string> = { 24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T" };
    return map[hours] ?? `${hours}H`;
  };

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "avg_price") return (a.avg_price - b.avg_price) * sortDir;
    if (sortKey === "volume") return (a.volume - b.volume) * sortDir;
    if (sortKey === "spread") return ((a.max_price - a.min_price) - (b.max_price - b.min_price)) * sortDir;
    return 0;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(-1); }
  };

  const SortBtn = ({ col, label }: { col: typeof sortKey; label: string }) => (
    <button onClick={() => toggleSort(col)} style={{
      background: "none", border: "none", cursor: "pointer",
      fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.15em",
      color: sortKey === col ? accentColor : "var(--text-muted)",
      display: "flex", alignItems: "center", gap: 4, padding: 0,
      fontWeight: 600,
    }}>
      {label}
      <span style={{ fontSize: 8, opacity: sortKey === col ? 1 : 0.3 }}>
        {sortKey === col ? (sortDir === -1 ? "▼" : "▲") : "▼"}
      </span>
    </button>
  );

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: 8,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 18, background: accentColor, borderRadius: 2, boxShadow: `0 0 8px ${accentColor}` }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 11, letterSpacing: "0.2em", color: "var(--text-primary)", fontWeight: 700 }}>
              {title.toUpperCase()}
            </div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              {subtitle}
            </div>
          </div>
        </div>
        <span style={{
          fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.15em",
          color: accentColor, background: `${accentColor}18`,
          padding: "3px 10px", borderRadius: 3, border: `1px solid ${accentColor}44`,
        }}>
          {hoursLabel()}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "10px 16px 10px 20px", textAlign: "left" }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.15em", color: "var(--text-muted)", fontWeight: 600 }}>ITEM</span>
              </th>
              <th style={{ padding: "10px 16px", textAlign: "right" }}>
                <SortBtn col="avg_price" label="PREIS" />
              </th>
              <th style={{ padding: "10px 16px", textAlign: "center" }}>
                <SortBtn col="spread" label="SPREAD" />
              </th>
              <th style={{ padding: "10px 16px", textAlign: "right" }}>
                <SortBtn col="volume" label="VOL" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 13 }}>
                  Keine Daten verfügbar
                </td>
              </tr>
            ) : (
              sorted.map((item, idx) => {
                const spread = item.max_price - item.min_price;
                const spreadPct = item.avg_price > 0 ? (spread / item.avg_price) * 100 : 0;
                const isHigh = spreadPct > 30;

                return (
                  <tr key={idx}
                    style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "default" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Item name */}
                    <td style={{ padding: "10px 16px 10px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                          minWidth: 16, textAlign: "right",
                        }}>{idx + 1}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.3 }}>
                            {item.item_name}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: 1 }}>
                            {new Date(item.datetime).toLocaleDateString("de-DE")}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Avg price */}
                    <td style={{ padding: "10px 16px", textAlign: "right", verticalAlign: "middle" }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--plat)", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                        <SmallPlatIcon />
                        {item.avg_price.toFixed(1)}
                      </div>
                    </td>

                    {/* Spread bar */}
                    <td style={{ padding: "10px 16px", minWidth: 130 }}>
                      <div style={{
                        fontSize: 10, textAlign: "center", marginBottom: 2,
                        fontFamily: "var(--font-mono)",
                        color: isHigh ? "var(--down)" : "var(--text-muted)",
                      }}>
                        {spreadPct.toFixed(0)}%
                      </div>
                      <Sparkbar min={item.min_price} avg={item.avg_price} max={item.max_price} />
                    </td>

                    {/* Volume */}
                    <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", verticalAlign: "middle" }}>
                      {item.volume.toLocaleString("de-DE")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default App;