import { useEffect, useState } from "react";
import { LogoIcon } from "./components/Icons";
import { TickerBanner } from "./components/Ticker";
import { StatsBar } from "./components/StatsBar";
import { MarketTable } from "./components/MarketTable";
import { CategoryTable } from "./components/CategoryTable";
import { ItemSearch } from "./components/ItemSearch";
import { Footer } from "./components/Footer";
import type { TopItem } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
  top_seller:    TopItem[];
  top_traded:    TopItem[];
}

interface CategoryItem {
  name:      string;
  slug:      string;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  volume:    number | null;
  tags:      string;
  ducats:    string | null;
  category?: string;
}

interface CategoriesOverview {
  name:  string;
  slug:  string;
  items: CategoryItem[];
}

// ─── API URLs ─────────────────────────────────────────────────────────────────
const API_CATEGORIES_URL = "/api/category?tag=all&limit=30";
const API_SEARCH_URL     = "/api/item/search";

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES   = ["Alle", "Warframes", "Mods", "Waffen", "Relics", "Ressourcen", "Arcanes"];
const HOURS_OPTIONS = [24, 48, 168, 336, 720, 2160];
const HOURS_LABELS: Record<number, string> = {
  24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T",
};

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  card:   "rgba(10,12,32,0.82)",
  hov:    "rgba(200,168,75,0.07)",
  b:      "rgba(200,168,75,0.22)",
  b2:     "rgba(200,168,75,0.38)",
  t:      "#e8dfc0",
  t2:     "#b8a97c",
  t3:     "#7a6e52",
  gold:   "#c8a84b",
  up:     "#4dba7f",
  cy:     "#5ab4c8",
  rad:    "2px",
  radBtn: "2px",
} as const;

// ─── Vitruvian helpers ────────────────────────────────────────────────────────
const CardCorner = () => (
  <svg width="14" height="14" viewBox="0 0 14 14"
    style={{ position: "absolute", top: 6, right: 6, pointerEvents: "none" }}>
    <line x1="0" y1="7" x2="14" y2="7" stroke="#c8a84b" strokeWidth="0.7" opacity="0.5" />
    <line x1="7" y1="0" x2="7" y2="14" stroke="#c8a84b" strokeWidth="0.7" opacity="0.5" />
  </svg>
);

const VitFlourish = () => (
  <svg width="60" height="10" viewBox="0 0 60 10" style={{ opacity: 0.55, flexShrink: 0 }}>
    <path d="M0 5 Q7.5 1 15 5 Q22.5 9 30 5 Q37.5 1 45 5 Q52.5 9 60 5"
      stroke="#c8a84b" strokeWidth="0.9" fill="none" />
  </svg>
);

// ─── App ──────────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [hours, setHours]                         = useState(24);
  const [data, setData]                           = useState<ApiResponse | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [category, setCategory]                   = useState("Alle");
  const [now, setNow]                             = useState(new Date());
  const [allCategories, setAllCategories]         = useState<CategoriesOverview[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [page, setPage]                           = useState<"dashboard" | "market" | "farmvalue">("dashboard");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchMarketData = async (h: number) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/top?hours=${h}&limit=10`);
      const json = await res.json();
      setData(json);
    } catch { /* keep previous */ }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchMarketData(hours); }, [hours]);

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res  = await fetch(API_CATEGORIES_URL);
      const json = await res.json();
      setAllCategories(json.categories || []);
    } catch { /* keep empty */ }
    finally { setCategoriesLoading(false); }
  };
  useEffect(() => { fetchCategories(); }, []);

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    padding:       active ? "4px 11px" : "5px 12px",
    borderRadius:  C.radBtn,
    border:        active ? `1px solid ${C.b2}` : "none",
    background:    active ? C.hov : "none",
    color:         active ? C.t : C.t3,
    fontSize:      12,
    fontWeight:    active ? 600 : 400,
    letterSpacing: "0.03em",
    cursor:        "pointer",
    transition:    "all 0.12s",
    fontFamily:    "system-ui, -apple-system, sans-serif",
  });

  return (
    <div style={{
      minHeight:     "100vh",
      display:       "flex",
      flexDirection: "column",
      fontFamily:    "system-ui, -apple-system, sans-serif",
      position:      "relative",
      zIndex:        1,
    }}>

      {/* ── Header ── */}
      <header style={{
        height: 54, background: "rgba(10,12,28,0.88)", borderBottom: `1px solid ${C.b2}`,
        display: "flex", alignItems: "center", gap: 14, padding: "0 22px",
        position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(14px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <LogoIcon />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: "0.16em", lineHeight: 1.1 }}>
              VOIDWATCH
            </div>
            <div style={{ fontSize: 10, color: C.t3, letterSpacing: "0.04em" }}>Platinum Market</div>
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: C.b, flexShrink: 0 }} />

        <nav style={{ display: "flex", gap: 3 }}>
          {(["dashboard", "market", "farmvalue"] as const).map((p) => (
            <button key={p} style={navBtnStyle(page === p)} onClick={() => setPage(p)}
              onMouseEnter={e => { if (page !== p) { e.currentTarget.style.background = C.hov; e.currentTarget.style.color = C.t; }}}
              onMouseLeave={e => { if (page !== p) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.t3; }}}>
              {p === "dashboard" ? "Dashboard" : p === "market" ? "Market" : "Farm Value"}
            </button>
          ))}
        </nav>

        <div style={{ flex: 1, maxWidth: 280, marginLeft: "auto", position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.t3 }}>
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input type="text" placeholder="Search items..." style={{
            width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.b}`,
            borderRadius: C.rad, padding: "6px 12px 6px 32px", color: C.t,
            fontSize: 13, outline: "none", transition: "border-color 0.15s",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
            onFocus={e => (e.currentTarget.style.borderColor = C.gold)}
            onBlur={e  => (e.currentTarget.style.borderColor = C.b)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {loading && <span style={{ fontSize: 10, color: C.t3, letterSpacing: "0.15em" }}>LADEN...</span>}
          <span style={{ fontSize: 11, color: C.t3 }}>
            Sync: <span style={{ color: C.t2 }}>{data ? formatTs(data.last_updated) : "—"}</span>
          </span>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.up, flexShrink: 0, animation: "pulse 2s ease infinite" }} />
          <span style={{ fontFamily: "monospace", fontSize: 13, color: C.t2, letterSpacing: "0.05em" }}>
            {now.toLocaleTimeString("de-DE")}
          </span>
        </div>
      </header>

      {/* ── Ticker ── */}
      {data && <TickerBanner items={data.top_performer} />}

      {/* ── Stats Bar ── */}
      {data && (
        <StatsBar
          topPerformer={data.top_performer}
          topTraded={data.top_traded}
        />
      )}

      {/* ── Pages ── */}
      <main style={{
        flex:      1,
        width:     "100%",
        maxWidth:  1400,
        margin:    "0 auto",
        padding:   "22px 22px 60px",
      }}>

        {/* Dashboard */}
        {page === "dashboard" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
              <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.2em", marginRight: 8 }}>ZEITRAUM</span>
              {HOURS_OPTIONS.map((h) => (
                <button key={h} onClick={() => setHours(h)} style={{
                  padding: "5px 14px",
                  border: hours === h ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
                  borderRadius: C.radBtn, background: hours === h ? C.hov : "transparent",
                  color: hours === h ? C.gold : C.t3, fontSize: 10, fontWeight: 700,
                  letterSpacing: "0.15em", cursor: "pointer", transition: "all 0.15s",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
                  onMouseEnter={e => { if (hours !== h) { e.currentTarget.style.color = C.t; e.currentTarget.style.borderColor = C.b2; }}}
                  onMouseLeave={e => { if (hours !== h) { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.b; }}}
                >
                  {HOURS_LABELS[h]}
                </button>
              ))}
            </div>

            {data && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, marginBottom: 18 }}>
                <MarketTable title="Top Performers"  subtitle="Stärkste Preisbewegung"      rows={data.top_performer} hours={hours} accentColor={C.up}   />
                <MarketTable title="Top Seller"       subtitle="Höchste Durchschnittspreise" rows={data.top_seller}    hours={hours} accentColor={C.gold} />
                <MarketTable title="Meistgehandelt"   subtitle="Höchstes Volumen"             rows={data.top_traded}    hours={hours} accentColor={C.cy}   />
              </div>
            )}
          </>
        )}

        {/* Market */}
        {page === "market" && (
          <>
            <section style={{
              background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
              marginBottom: 18, overflow: "hidden", backdropFilter: "blur(10px)", position: "relative",
            }}>
              <CardCorner />
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
                background: "rgba(0,0,0,0.18)", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 2, height: 15, borderRadius: 1, background: C.cy, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Category Browser</span>
                  <span style={{ fontSize: 12, color: C.t3, fontWeight: 400 }}>
                    · {category === "Alle"
                      ? (allCategories?.reduce((a, c) => a + c.items.length, 0) ?? 0)
                      : (allCategories?.find(c => c.name === category)?.items?.length ?? 0)} Items
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <VitFlourish />
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                    {CATEGORIES.map((cat) => (
                      <button key={cat} onClick={() => setCategory(cat)} style={{
                        padding: "4px 12px",
                        border: category === cat ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
                        borderRadius: C.radBtn, background: category === cat ? "rgba(200,168,75,0.09)" : "none",
                        color: category === cat ? C.gold : C.t3, fontSize: 12,
                        fontWeight: category === cat ? 600 : 400, cursor: "pointer", transition: "all 0.12s",
                        fontFamily: "system-ui, -apple-system, sans-serif",
                      }}
                        onMouseEnter={e => { if (category !== cat) e.currentTarget.style.color = C.t; }}
                        onMouseLeave={e => { if (category !== cat) e.currentTarget.style.color = C.t3; }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {categoriesLoading ? (
                <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontFamily: "monospace", letterSpacing: "0.15em" }}>
                  KATEGORIEN LADEN...
                </div>
              ) : (
                <CategoryTable category={category} allCategories={allCategories} />
              )}
            </section>
            <ItemSearch searchUrl={API_SEARCH_URL} itemUrl="/api/item/" />
          </>
        )}

        {/* Farm Value */}
        {page === "farmvalue" && (
          <section style={{
            background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
            overflow: "hidden", backdropFilter: "blur(10px)", position: "relative",
          }}>
            <CardCorner />
            <div style={{
              padding: "13px 18px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.18)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{ width: 2, height: 15, borderRadius: 1, background: C.up, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Best Items to Farm</span>
                <span style={{ fontSize: 12, color: C.t3, fontWeight: 400 }}>expected ₱ / 100 runs</span>
              </div>
              <VitFlourish />
            </div>
            <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontSize: 13, fontStyle: "italic" }}>
              Farm Value — coming soon
            </div>
          </section>
        )}

      </main>

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
};

export default App;