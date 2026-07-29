import { useEffect, useRef, useState } from "react";
import { LogoIcon } from "./components/Icons";
import { TickerBanner } from "./components/Ticker";
import { DashboardPage, loadMetric, saveMetric } from "./components/DashboardPage";
import type { ChangeMetric } from "./components/DashboardPage";
import { CategoryTable } from "./components/CategoryTable";
import { SearchBox } from "./components/SearchBox";
import { Footer } from "./components/Footer";
import { MoversPage } from "./components/MoversPage";
import { FarmValuePage } from "./components/FarmValuePage";
import { ItemPage } from "./components/ItemPage";
import type { TopItem } from "./types";
import { C, CardCorner, FilterLabel, T, TAG_OPTIONS, TextLink, VitFlourish, segBtn, segBtnHover } from "./components/shared";
import { A, itemSlugFromPath, navigate, useRoute } from "./router";

interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
  top_loser:     TopItem[];   // echte Verlierer, seit /api/top sie separat liefert
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

const CATEGORIES = ["Alle", "Warframes", "Mods", "Waffen", "Relics", "Arcanes", "Misc"];
const MISC_SUBS  = ["Fish", "Skins & Helmets", "Scenes", "Gems & Resources", "Ayatan", "Necramech", "Sonstiges"];

type Page = "dashboard" | "market" | "movers" | "farmvalue";

const App: React.FC = () => {
  const [hours, setHours]                         = useState(24);
  const [activeTag, setActiveTag]                 = useState<string | null>(null);
  const [data, setData]                           = useState<ApiResponse | null>(null);
  const [status, setStatus]                       = useState<StatusResponse | null>(null);
  const [tickerItems, setTickerItems]             = useState<TopItem[]>([]);
  const [category, setCategory]                   = useState("Alle");
  const [now, setNow]                             = useState(new Date());
  const [allCategories, setAllCategories]         = useState<CategoriesOverview[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [page, setPage]                           = useState<Page>("dashboard");
  const [miscSub, setMiscSub]                     = useState<string | null>(null);
  const [miscOpen, setMiscOpen]                   = useState(false);
  // Einheit der Veränderungs-Ansichten: prozentual oder Platin-Differenz.
  const [metric, setMetric]                       = useState<ChangeMetric>(loadMetric);
  const miscRef                                   = useRef<HTMLDivElement>(null);

  const route    = useRoute();
  const itemSlug = itemSlugFromPath(route);

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

  const fetchMarketData = async (h: number, tag: string | null, m: ChangeMetric) => {
    try {
      const tagParam = tag ? `&tag=${tag}` : "";
      const res  = await fetch(`/api/top?hours=${h}&limit=10&metric=${m}${tagParam}`);
      const json = await res.json();
      setData(json);
    } catch { /* keep */ }
  };
  useEffect(() => { fetchMarketData(hours, activeTag, metric); }, [hours, activeTag, metric]);

  // Ticker: eigene, ungefilterte Datenquelle (fest 24H) — bewusst entkoppelt
  // von hours/activeTag, damit Dashboard-Filter den Ticker nicht neu starten.
  // State wird nur ersetzt wenn sich der Inhalt wirklich ändert, damit die
  // CSS-Animation auch beim 60s-Refresh nicht springt.
  const fetchTicker = async () => {
    try {
      const res  = await fetch("/api/top?hours=24&limit=10");
      const json = await res.json();
      const next: TopItem[] = json.top_performer ?? [];
      setTickerItems(prev =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
    } catch { /* keep */ }
  };
  useEffect(() => {
    fetchTicker();
    const t = setInterval(fetchTicker, 60_000);
    return () => clearInterval(t);
  }, []);

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
    padding: active ? "5px 12px" : "6px 13px", borderRadius: C.radBtn,
    border: active ? `1px solid ${C.b2}` : "1px solid transparent",
    background: active ? C.hov : "none",
    color: active ? C.t : C.t2,
    fontSize: 13, fontWeight: active ? 700 : 500,
    letterSpacing: "0.03em", cursor: "pointer", transition: "all 0.12s",
  });

  const catBtnStyle = (active: boolean): React.CSSProperties => ({
    ...segBtn(active),
    padding: "5px 13px",
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
        height: 58, background: "rgba(10,12,28,0.88)", borderBottom: `1px solid ${C.b2}`,
        display: "flex", alignItems: "center", gap: 14, padding: "0 22px",
        position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(14px)",
      }}>
        <A href="/" style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <LogoIcon />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, letterSpacing: "0.16em", lineHeight: 1.1 }}>VOIDWATCH</div>
            <div style={{ fontSize: 11, color: C.t2, letterSpacing: "0.04em" }}>Platinum Market</div>
          </div>
        </A>

        <div style={{ width: 1, height: 22, background: C.b, flexShrink: 0 }} />

        <nav style={{ display: "flex", gap: 3 }}>
          {NAV.map(({ key, label }) => (
            <button key={key} style={navBtnStyle(page === key && !itemSlug)}
              onClick={() => { setPage(key); navigate("/"); }}
              onMouseEnter={e => { if (page !== key) { e.currentTarget.style.background = C.hov; e.currentTarget.style.color = C.t; }}}
              onMouseLeave={e => { if (page !== key) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.t2; }}}>
              {label}
            </button>
          ))}
        </nav>

        {/* Center search */}
        <SearchBox />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {status?.wf_build_label && (
            <span style={{ ...T.meta }}>
              Last Update: <TextLink href={status.wf_update_url ?? "#"} color={C.gold}
                style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>
                {status.wf_update_name} ({status.wf_update_version})
              </TextLink>
            </span>
          )}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.up, flexShrink: 0, animation: "pulse 2s ease infinite" }} />
          <span style={{ ...T.num, color: C.t, letterSpacing: "0.05em" }}>
            {now.toLocaleTimeString("de-DE")}
          </span>
        </div>
      </header>

      {/* ── Ticker ── */}
      {tickerItems.length > 0 && <TickerBanner items={tickerItems} />}

      {/* ── Pages ── */}
      <main style={{ flex: 1, width: "100%", maxWidth: 1400, margin: "0 auto", padding: "22px 22px 60px" }}>

        {itemSlug && <ItemPage key={itemSlug} slug={itemSlug} />}

        {!itemSlug && page === "dashboard" && (
          <>
            {/* Zeitraum + Kategorie Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <FilterLabel>ZEITRAUM</FilterLabel>
                {([24, 48, 168, 336, 720, 2160] as const).map(h => {
                  const labels: Record<number, string> = { 24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T" };
                  const active = hours === h;
                  return (
                    <button key={h} onClick={() => setHours(h)}
                      style={segBtn(active)} {...segBtnHover(active)}>
                      {labels[h]}
                    </button>
                  );
                })}
              </div>
              <div style={{ width: 1, height: 20, background: C.b, flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <FilterLabel>KATEGORIE</FilterLabel>
                {TAG_OPTIONS.map(({ label, value }) => {
                  const active = activeTag === value;
                  return (
                    <button key={label} onClick={() => setActiveTag(value)}
                      style={segBtn(active)} {...segBtnHover(active)}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <DashboardPage data={data} hours={hours} metric={metric} onMetricChange={m => { saveMetric(m); setMetric(m); }} />
          </>
        )}

        {!itemSlug && page === "market" && (
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
                  <span style={T.cardTitle}>Category Browser</span>
                  <span style={T.meta}>· {visibleItemCount()} Items</span>
                  {category === "Misc" && miscSub && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.gold, background: "rgba(200,168,75,0.12)", border: `1px solid rgba(200,168,75,0.25)`, borderRadius: C.radBtn, padding: "2px 8px" }}>
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
                        style={catBtnStyle(category === cat)} {...segBtnHover(category === cat)}>
                        {cat}
                      </button>
                    ) : (
                      <div key="Misc" ref={miscRef} style={{ position: "relative" }}>
                        <button onClick={() => setMiscOpen(o => !o)}
                          style={{ ...catBtnStyle(category === "Misc"), padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}
                          {...segBtnHover(category === "Misc")}>
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
                                style={{ padding: "6px 10px", borderRadius: C.radBtn, border: "none", textAlign: "left", cursor: "pointer", fontSize: 12, background: miscSub === sub ? C.hov : "none", color: miscSub === sub ? C.gold : C.t2, fontWeight: miscSub === sub ? 600 : 500 }}>
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
                <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontFamily: "monospace", fontSize: 12, letterSpacing: "0.15em" }}>KATEGORIEN LADEN...</div>
              ) : (
                <CategoryTable category={category} allCategories={allCategories} miscSub={miscSub} />
              )}
            </section>
          </>
        )}

        {!itemSlug && page === "movers"    && <MoversPage />}
        {!itemSlug && page === "farmvalue" && <FarmValuePage />}
      </main>

      <Footer status={status} />
    </div>
  );
};

export default App;