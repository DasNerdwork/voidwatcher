import { useEffect, useRef, useState } from "react";
import { LogoIcon } from "./components/Icons";
import { TickerBanner } from "./components/Ticker";
import { DashboardPage } from "./components/DashboardPage";
import { CategoryTable } from "./components/CategoryTable";
import { ItemSearch } from "./components/ItemSearch";
import { Footer } from "./components/Footer";
import { MoversPage } from "./components/MoversPage";
import { FarmValuePage } from "./components/FarmValuePage";
import type { TopItem } from "./types";
import { C, CardCorner, VitFlourish } from "./components/shared";

interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
  top_seller:    TopItem[];
  top_traded:    TopItem[];
}

interface StatusResponse {
  wf_build_label:          string | null;
  wf_build_updated_at:     string | null;
  wf_update_name:          string | null;
  wf_update_version:       string | null;
  wf_update_url:           string | null;
  wfpe_version:            string | null;
  wfpe_version_updated_at: string | null;
  wfm_items_updated_at:    string | null;
  last_updated:            string | null;
}

interface CategoryItem {
  name:         string;
  slug:         string;
  avg_price:    number | null;
  min_price:    number | null;
  max_price:    number | null;
  volume:       number | null;
  tags:         string;
  ducats:       string | null;
  category?:    string;
  subcategory?: string | null;
}

interface CategoriesOverview {
  name:  string;
  slug:  string;
  items: CategoryItem[];
}

const API_CATEGORIES_URL = "/api/category?tag=all";
const API_SEARCH_URL     = "/api/item/search";

const CATEGORIES = ["Alle", "Warframes", "Mods", "Waffen", "Relics", "Arcanes", "Misc"];
const MISC_SUBS  = ["Fish", "Skins & Helmets", "Scenes", "Gems & Resources", "Ayatan", "Necramech", "Sonstiges"];

type Page = "dashboard" | "market" | "movers" | "farmvalue";

const App: React.FC = () => {
  const [hours, setHours]                         = useState(24);
  const [activeTag, setActiveTag]                 = useState<string | null>(null);
  const [data, setData]                           = useState<ApiResponse | null>(null);
  const [loading, setLoading]                     = useState(true);
  const [status, setStatus]                       = useState<StatusResponse | null>(null);
  const [category, setCategory]                   = useState("Alle");
  const [now, setNow]                             = useState(new Date());
  const [allCategories, setAllCategories]         = useState<CategoriesOverview[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [page, setPage]                           = useState<Page>("dashboard");
  const [miscSub, setMiscSub]                     = useState<string | null>(null);
  const [miscOpen, setMiscOpen]                   = useState(false);
  const miscRef                                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!miscOpen) return;
    const handler = (e: MouseEvent) => {
      if (miscRef.current && !miscRef.current.contains(e.target as Node)) setMiscOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [miscOpen]);

  const fetchMarketData = async (h: number, tag: string | null) => {
    setLoading(true);
    try {
      const tagParam = tag ? `&tag=${tag}` : "";
      const res  = await fetch(`/api/top?hours=${h}&limit=10${tagParam}`);
      const json = await res.json();
      setData(json);
    } catch { /* keep */ }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchMarketData(hours, activeTag); }, [hours, activeTag]);

  const fetchStatus = async () => {
    try {
      const res  = await fetch("/api/status");
      const json = await res.json();
      setStatus(json);
    } catch { /* keep */ }
  };
  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res  = await fetch(API_CATEGORIES_URL);
      const json = await res.json();
      setAllCategories(json.categories || []);
    } catch { /* keep */ }
    finally { setCategoriesLoading(false); }
  };
  useEffect(() => { fetchCategories(); }, []);

  const visibleItemCount = () => {
    if (category === "Alle") return allCategories.reduce((a, c) => a + c.items.length, 0);
    if (category === "Misc") {
      const misc = allCategories.find(c => c.name === "Misc")?.items ?? [];
      return miscSub ? misc.filter(i => i.subcategory === miscSub).length : misc.length;
    }
    return allCategories.find(c => c.name === category)?.items?.length ?? 0;
  };

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: active ? "4px 11px" : "5px 12px", borderRadius: C.radBtn,
    border: active ? `1px solid ${C.b2}` : "none",
    background: active ? C.hov : "none",
    color: active ? C.t : C.t3,
    fontSize: 12, fontWeight: active ? 600 : 400,
    letterSpacing: "0.03em", cursor: "pointer", transition: "all 0.12s",
  });

  const catBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    border: active ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
    borderRadius: C.radBtn,
    background: active ? "rgba(200,168,75,0.09)" : "none",
    color: active ? C.gold : C.t3,
    fontSize: 12, fontWeight: active ? 600 : 400,
    cursor: "pointer", transition: "all 0.12s",
  });

  const NAV: { key: Page; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "market",    label: "Market"    },
    { key: "movers",    label: "Movers"    },
    { key: "farmvalue", label: "Farm Value"},
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, -apple-system, sans-serif", position: "relative", zIndex: 1 }}>

      {/* ── Header ── */}
      <header style={{
        height: 54, background: "rgba(10,12,28,0.88)", borderBottom: `1px solid ${C.b2}`,
        display: "flex", alignItems: "center", gap: 14, padding: "0 22px",
        position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(14px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <LogoIcon />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: "0.16em", lineHeight: 1.1 }}>VOIDWATCH</div>
            <div style={{ fontSize: 10, color: C.t3, letterSpacing: "0.04em" }}>Platinum Market</div>
          </div>
        </div>

        <div style={{ width: 1, height: 22, background: C.b, flexShrink: 0 }} />

        <nav style={{ display: "flex", gap: 3 }}>
          {NAV.map(({ key, label }) => (
            <button key={key} style={navBtnStyle(page === key)} onClick={() => setPage(key)}
              onMouseEnter={e => { if (page !== key) { e.currentTarget.style.background = C.hov; e.currentTarget.style.color = C.t; }}}
              onMouseLeave={e => { if (page !== key) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.t3; }}}>
              {label}
            </button>
          ))}
        </nav>

        {/* Center search */}
        <div style={{ flex: 1, maxWidth: 320, margin: "0 auto", position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: C.t3 }}>
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input type="text" placeholder="Item suchen…" style={{
            width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.b}`,
            borderRadius: C.rad, padding: "6px 12px 6px 32px", color: C.t,
            fontSize: 13, outline: "none", transition: "border-color 0.15s",
          }}
            onFocus={e => (e.currentTarget.style.borderColor = C.gold)}
            onBlur={e  => (e.currentTarget.style.borderColor = C.b)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {loading && <span style={{ fontSize: 10, color: C.t3, letterSpacing: "0.15em" }}>LADEN...</span>}
          {status?.wf_build_label && (
            <span style={{ fontSize: 11, color: C.t3 }}>
              Last Update: <a href={status.wf_update_url ?? "#"} style={{ color: C.gold, fontFamily: "monospace", textDecoration: "none"}}>{status.wf_update_name} ({status.wf_update_version})</a>
            </span>
          )}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.up, flexShrink: 0, animation: "pulse 2s ease infinite" }} />
          <span style={{ fontFamily: "monospace", fontSize: 13, color: C.t2, letterSpacing: "0.05em" }}>
            {now.toLocaleTimeString("de-DE")}
          </span>
        </div>
      </header>

      {/* ── Ticker ── */}
      {data && <TickerBanner items={data.top_performer} />}

      {/* ── Pages ── */}
      <main style={{ flex: 1, width: "100%", maxWidth: 1400, margin: "0 auto", padding: "22px 22px 60px" }}>

        {page === "dashboard" && (
          <>
            {/* Zeitraum + Kategorie Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.2em", marginRight: 4 }}>ZEITRAUM</span>
                {([24, 48, 168, 336, 720] as const).map(h => {
                  const labels: Record<number, string> = { 24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T" };
                  return (
                    <button key={h} onClick={() => setHours(h)} style={{
                      padding: "4px 11px", border: hours === h ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
                      borderRadius: 2, background: hours === h ? C.hov : "transparent",
                      color: hours === h ? C.gold : C.t3, fontSize: 10, fontWeight: 700,
                      letterSpacing: "0.12em", cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                    }}>
                      {labels[h]}
                    </button>
                  );
                })}
              </div>
              <div style={{ width: 1, height: 18, background: C.b, flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.18em", marginRight: 2 }}>KATEGORIE</span>
                {([
                  { label: "Alle",      value: null       },
                  { label: "Mods",      value: "mod"      },
                  { label: "Prime",     value: "prime"    },
                  { label: "Relics",    value: "relic"    },
                  { label: "Waffen",    value: "weapon"   },
                  { label: "Warframes", value: "warframe" },
                  { label: "Arcanes",   value: "arcane"   },
                ] as { label: string; value: string | null }[]).map(({ label, value }) => {
                  const active = activeTag === value;
                  return (
                    <button key={label} onClick={() => setActiveTag(value)} style={{
                      padding: "4px 10px", fontSize: 10, fontWeight: active ? 700 : 400,
                      border: active ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
                      borderRadius: 2, background: active ? C.hov : "transparent",
                      color: active ? C.gold : C.t3, letterSpacing: "0.08em",
                      cursor: "pointer", transition: "all 0.12s", fontFamily: "inherit",
                    }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <DashboardPage data={data} hours={hours} />
          </>
        )}

        {page === "market" && (
          <>
            <section style={{
              background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
              marginBottom: 18, overflow: "visible", backdropFilter: "blur(10px)", position: "relative",
            }}>
              <CardCorner />
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
                background: "rgba(0,0,0,0.18)", gap: 10, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 2, height: 15, borderRadius: 1, background: C.cy, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Category Browser</span>
                  <span style={{ fontSize: 12, color: C.t3 }}>· {visibleItemCount()} Items</span>
                  {category === "Misc" && miscSub && (
                    <span style={{ fontSize: 10, color: C.gold, background: "rgba(200,168,75,0.12)", border: `1px solid rgba(200,168,75,0.25)`, borderRadius: C.radBtn, padding: "2px 8px" }}>
                      {miscSub}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <VitFlourish />
                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
                    {CATEGORIES.map(cat => cat !== "Misc" ? (
                      <button key={cat}
                        onClick={() => { setCategory(cat); setMiscSub(null); setMiscOpen(false); }}
                        style={catBtnStyle(category === cat)}
                        onMouseEnter={e => { if (category !== cat) e.currentTarget.style.color = C.t; }}
                        onMouseLeave={e => { if (category !== cat) e.currentTarget.style.color = C.t3; }}>
                        {cat}
                      </button>
                    ) : (
                      <div key="Misc" ref={miscRef} style={{ position: "relative" }}>
                        <button onClick={() => setMiscOpen(o => !o)}
                          style={{ ...catBtnStyle(category === "Misc"), padding: "4px 9px", display: "flex", alignItems: "center", gap: 5 }}
                          onMouseEnter={e => { if (category !== "Misc") e.currentTarget.style.color = C.t; }}
                          onMouseLeave={e => { if (category !== "Misc") e.currentTarget.style.color = C.t3; }}>
                          Misc
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: miscOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                            <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {miscOpen && (
                          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "rgba(10,12,28,0.97)", border: `1px solid ${C.b2}`, borderRadius: C.rad, padding: "5px", zIndex: 200, display: "flex", flexDirection: "column", gap: 1, minWidth: 170, backdropFilter: "blur(14px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                            <button onClick={() => { setCategory("Misc"); setMiscSub(null); setMiscOpen(false); }}
                              style={{ padding: "6px 10px", borderRadius: C.radBtn, border: "none", textAlign: "left", cursor: "pointer", fontSize: 12, background: miscSub === null ? C.hov : "none", color: miscSub === null ? C.gold : C.t2, fontWeight: miscSub === null ? 600 : 400 }}>
                              Alle Misc
                            </button>
                            <div style={{ height: 1, background: C.b, margin: "3px 4px" }} />
                            {MISC_SUBS.map(sub => (
                              <button key={sub} onClick={() => { setCategory("Misc"); setMiscSub(sub); setMiscOpen(false); }}
                                style={{ padding: "6px 10px", borderRadius: C.radBtn, border: "none", textAlign: "left", cursor: "pointer", fontSize: 12, background: miscSub === sub ? C.hov : "none", color: miscSub === sub ? C.gold : C.t3, fontWeight: miscSub === sub ? 600 : 400 }}>
                                {sub}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {categoriesLoading ? (
                <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontFamily: "monospace", letterSpacing: "0.15em" }}>KATEGORIEN LADEN...</div>
              ) : (
                <CategoryTable category={category} allCategories={allCategories} miscSub={miscSub} />
              )}
            </section>
            <ItemSearch searchUrl={API_SEARCH_URL} itemUrl="/api/item/" />
          </>
        )}

        {page === "movers"    && <MoversPage />}
        {page === "farmvalue" && <FarmValuePage />}
      </main>

      <Footer status={status} />
    </div>
  );
};

export default App;