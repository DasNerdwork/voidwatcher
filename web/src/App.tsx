import { useEffect, useRef, useState } from "react";
import { LogoIcon } from "./components/Icons";
import { TickerBanner } from "./components/Ticker";
import { DashboardPage } from "./components/DashboardPage";
import type { ChangeMetric } from "./components/DashboardPage";
import { CategoryTable } from "./components/CategoryTable";
import { SearchBox } from "./components/SearchBox";
import { Footer } from "./components/Footer";
import { FarmValuePage } from "./components/FarmValuePage";
import { ItemPage } from "./components/ItemPage";
import { WarframesPage, prefetchWarframes } from "./components/WarframesPage";
import type { TopItem } from "./types";
import { C, CardCorner, FilterLabel, HOURS_LABELS, HOURS_OPTIONS, HeaderClock, T, TAG_OPTIONS, TextLink, VitFlourish, hoverSurface, segBtn, segBtnHover } from "./components/shared";
import { A, WARFRAMES_PATH, isWarframesPath, itemSlugFromPath, navigate, useRoute } from "./router";
import { oneOf, usePersistentState } from "./prefs";
import { locale, t, useI18n } from "./i18n";
import { SettingsMenu } from "./components/SettingsMenu";

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

// Werte, keine Beschriftungen: dieselben Zeichenketten kommen aus
// classify_item_by_tags (api/db.py), stehen im Filterzustand und sind Schlüssel
// in CATEGORY_COLORS. Übersetzt wird erst beim Rendern über t().
const CATEGORIES = ["All", "Warframes", "Mods", "Weapons", "Relics", "Arcanes", "Misc"];
const MISC_SUBS  = ["Fish", "Skins & Helmets", "Scenes", "Gems & Resources", "Ayatan", "Necramech", "Other"];

type Page = "dashboard" | "market" | "farmvalue";

const isHours  = oneOf<number>(HOURS_OPTIONS);
const isTag    = oneOf<string | null>(TAG_OPTIONS.map(o => o.value));
const isMetric = oneOf<ChangeMetric>(["pct", "abs"]);

const App: React.FC = () => {
  // Am Sprach-Context hängen, damit ein Umschalten sofort durchschlägt: t()
  // liest die Sprache aus einer Modulvariablen und löst von sich aus kein
  // Neuzeichnen aus.
  useI18n();
  // Zeitraum und Kategorie überdauern das Neuladen: wer sich einmal für einen
  // Ausschnitt entschieden hat, will ihn nicht bei jedem Aufruf neu einstellen.
  // 48H als Vorgabe, weil ein Tagesfenster für die meisten Items zu wenige
  // Buckets hat, um eine Bewegung zu zeigen.
  const [hours, setHours]                         = usePersistentState("vw:hours", 48, isHours);
  const [activeTag, setActiveTag]                 = usePersistentState<string | null>("vw:tag", null, isTag);
  const [data, setData]                           = useState<ApiResponse | null>(null);
  const [status, setStatus]                       = useState<StatusResponse | null>(null);
  const [tickerItems, setTickerItems]             = useState<TopItem[]>([]);
  const [category, setCategory]                   = useState("All");
  const [allCategories, setAllCategories]         = useState<CategoriesOverview[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [page, setPage]                           = useState<Page>("dashboard");
  const [miscSub, setMiscSub]                     = useState<string | null>(null);
  const [miscOpen, setMiscOpen]                   = useState(false);
  // Einheit der Veränderungs-Ansichten: prozentual oder Platin-Differenz.
  const [metric, setMetric]                       = usePersistentState<ChangeMetric>("vw:change-metric", "pct", isMetric);
  const miscRef                                   = useRef<HTMLDivElement>(null);

  const route    = useRoute();
  const itemSlug = itemSlugFromPath(route);

  // Eine Weiche statt einer !itemSlug-Kette an jedem Block. Die Reihenfolge
  // trägt: die Item-Seite gewinnt gegen alles, damit die Kopfsuche auch von
  // /warframes aus funktioniert.
  const view: "item" | "warframes" | "pages" =
    itemSlug ? "item" : isWarframesPath(route) ? "warframes" : "pages";

  useEffect(() => {
    if (!miscOpen) return;
    const handler = (e: MouseEvent) => {
      if (miscRef.current && !miscRef.current.contains(e.target as Node)) setMiscOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [miscOpen]);

  // cancelled-Flag: beim schnellen Wechsel von Zeitraum oder Kategorie kann eine
  // ältere Antwort nach der aktuellen eintreffen und die Listen mit den Daten des
  // vorherigen Filters füllen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tagParam = activeTag ? `&tag=${activeTag}` : "";
        const res  = await fetch(`/api/top?hours=${hours}&limit=10&metric=${metric}${tagParam}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch { /* keep */ }
    })();
    return () => { cancelled = true; };
  }, [hours, activeTag, metric]);

  // Ticker: eigene, ungefilterte Datenquelle (fest 24H) — bewusst entkoppelt
  // von hours/activeTag, damit Dashboard-Filter den Ticker nicht neu starten.
  // State wird nur ersetzt wenn sich der Inhalt wirklich ändert, damit die
  // CSS-Animation auch beim 60s-Refresh nicht springt.
  //
  // Gewinner und Verlierer im Wechsel, je 5 — ein Laufband, das nur steigende
  // Werte zeigt, beschreibt den Markt nicht. Die Zahl 10 ist keine Willkür:
  // .ticker-track läuft mit fester Dauer über translateX(-50%), mehr Einträge
  // bedeuten also proportional schnelleres Scrollen.
  const fetchTicker = async () => {
    try {
      const res  = await fetch("/api/top?hours=24&limit=10");
      const json = await res.json();
      const gainers: TopItem[] = (json.top_performer ?? []).slice(0, 5);
      const losers:  TopItem[] = (json.top_loser ?? []).slice(0, 5);
      // Reißverschluss; ist eine Liste kürzer, hängt der Rest der anderen an.
      const next: TopItem[] = [];
      for (let i = 0; i < Math.max(gainers.length, losers.length); i++) {
        if (gainers[i]) next.push(gainers[i]);
        if (losers[i])  next.push(losers[i]);
      }
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
    if (category === "All") return allCategories.reduce((a, c) => a + c.items.length, 0);
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
    fontSize: 14, fontWeight: active ? 700 : 500,
    letterSpacing: "0.03em", cursor: "pointer", transition: "all 0.12s",
  });

  const catBtnStyle = (active: boolean): React.CSSProperties => ({
    ...segBtn(active),
    padding: "5px 13px",
  });

  // Zwei Arten von Reitern, und der Unterschied steht bewusst im Datenmodell
  // statt in verstreuten Abfragen: die vier Marktsichten sind Zustand unter "/",
  // die Warframe-Übersicht ist ein Ort mit eigener URL.
  type NavTab = { label: string } & ({ page: Page } | { path: string });

  const NAV: NavTab[] = [
    { page: "dashboard", label: t("Home")            },
    { page: "market",    label: t("Market")          },
    { page: "farmvalue", label: t("Farm Efficiency") },
    { path: WARFRAMES_PATH, label: t("Warframe Stats") },
  ];

  const isTabActive = (t: NavTab) =>
    "path" in t ? view === "warframes" : view === "pages" && page === t.page;

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
            <div style={{ fontSize: 14, fontWeight: 700, color: C.gold, letterSpacing: "0.16em", lineHeight: 1.1 }}>VOIDWATCH</div>
            <div style={{ fontSize: 12, color: C.t2, letterSpacing: "0.04em" }}>{t("Platinum Market")}</div>
          </div>
        </A>

        <div style={{ width: 1, height: 22, background: C.b, flexShrink: 0 }} />

        <nav style={{ display: "flex", gap: 3 }}>
          {NAV.map(tab => {
            const active = isTabActive(tab);
            // hoverSurface statt handgeschriebener Handler: dieselbe Wirkung,
            // aber im Hausmuster — restColor C.t2 ist genau die Ruhefarbe von
            // navBtnStyle(false).
            const shared = {
              style: navBtnStyle(active),
              ...hoverSurface({ active, restBorder: "transparent" }),
            };
            // Der Pfad-Reiter ist ein echtes <a>: Strg- und Mittelklick sollen
            // weiterhin einen neuen Tab öffnen.
            // Beim Überfahren schon holen: zwischen Hover und Klick liegen
            // typisch 200–400 ms, die Antwort kommt aus dem Server-Cache in
            // wenigen Millisekunden. Wer den Reiter nie anfasst, lädt nichts.
            // onFocus deckt die Tastaturbedienung mit ab.
            return "path" in tab
              ? <A key={tab.path} href={tab.path} {...shared}
                   onMouseEnter={e => { shared.onMouseEnter?.(e); prefetchWarframes().catch(() => {}); }}
                   onFocus={() => { prefetchWarframes().catch(() => {}); }}>
                  {tab.label}
                </A>
              : <button key={tab.page} onClick={() => { setPage(tab.page); navigate("/"); }} {...shared}>
                  {tab.label}
                </button>;
          })}
        </nav>

        {/* Center search */}
        <SearchBox />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {status?.wf_build_label && (
            <span style={{ ...T.meta }}>
              {t("Last Update:")} <TextLink href={status.wf_update_url ?? "#"} color={C.gold}
                style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>
                {status.wf_update_name} ({status.wf_update_version})
              </TextLink>
            </span>
          )}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.up, flexShrink: 0, animation: "pulse 2s ease infinite" }} />
          <HeaderClock locale={locale()} />
          <SettingsMenu />
        </div>
      </header>

      {/* ── Ticker ── */}
      {tickerItems.length > 0 && <TickerBanner items={tickerItems} />}

      {/* ── Pages ── */}
      <main style={{ flex: 1, width: "100%", maxWidth: 1400, margin: "0 auto", padding: "22px 22px 60px" }}>

        {view === "item" && <ItemPage key={itemSlug!} slug={itemSlug!} />}

        {view === "warframes" && <WarframesPage />}

        {view === "pages" && page === "dashboard" && (
          <>
            {/* Zeitraum + Kategorie Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <FilterLabel>{t("PERIOD")}</FilterLabel>
                {HOURS_OPTIONS.map(h => {
                  const active = hours === h;
                  return (
                    <button key={h} onClick={() => setHours(h)}
                      style={segBtn(active)} {...segBtnHover(active)}>
                      {t(HOURS_LABELS[h])}
                    </button>
                  );
                })}
              </div>
              <div style={{ width: 1, height: 20, background: C.b, flexShrink: 0 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                <FilterLabel>{t("CATEGORY")}</FilterLabel>
                {TAG_OPTIONS.map(({ label, value }) => {
                  const active = activeTag === value;
                  return (
                    <button key={label} onClick={() => setActiveTag(value)}
                      style={segBtn(active)} {...segBtnHover(active)}>
                      {t(label)}
                    </button>
                  );
                })}
              </div>
            </div>
            <DashboardPage data={data} hours={hours} metric={metric} onMetricChange={setMetric} />
          </>
        )}

        {view === "pages" && page === "market" && (
          <>
            {/* Kein backdropFilter auf dieser Karte: sie umschließt die ganze
                Tabelle und wird bei „Alle" über 100.000 px hoch. Der Compositor
                müsste diesen Hintergrund bei jedem Scroll-Frame neu weichzeichnen.
                Die anderen Karten der App bleiben bildschirmhoch und behalten ihn. */}
            <section style={{
              background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
              marginBottom: 18, overflow: "visible", position: "relative",
            }}>
              <CardCorner />
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
                background: "rgba(0,0,0,0.18)", gap: 10, flexWrap: "wrap",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{ width: 2, height: 15, borderRadius: 1, background: C.cy, flexShrink: 0 }} />
                  <span style={T.cardTitle}>{t("Category Browser")}</span>
                  <span style={T.meta}>· {t("%d items", visibleItemCount())}</span>
                  {category === "Misc" && miscSub && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.gold, background: "rgba(200,168,75,0.12)", border: `1px solid rgba(200,168,75,0.25)`, borderRadius: C.radBtn, padding: "2px 8px" }}>
                      {t(miscSub)}
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
                        {t(cat)}
                      </button>
                    ) : (
                      <div key="Misc" ref={miscRef} style={{ position: "relative" }}>
                        <button onClick={() => setMiscOpen(o => !o)}
                          style={{ ...catBtnStyle(category === "Misc"), padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}
                          {...segBtnHover(category === "Misc")}>
                          {t("Misc")}
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: miscOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                            <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {miscOpen && (
                          <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "rgba(10,12,28,0.97)", border: `1px solid ${C.b2}`, borderRadius: C.rad, padding: "5px", zIndex: 200, display: "flex", flexDirection: "column", gap: 1, minWidth: 170, backdropFilter: "blur(14px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                            <button onClick={() => { setCategory("Misc"); setMiscSub(null); setMiscOpen(false); }}
                              style={{ padding: "6px 10px", borderRadius: C.radBtn, border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, background: miscSub === null ? C.hov : "none", color: miscSub === null ? C.gold : C.t2, fontWeight: miscSub === null ? 600 : 400 }}>
                              {t("All Misc")}
                            </button>
                            <div style={{ height: 1, background: C.b, margin: "3px 4px" }} />
                            {MISC_SUBS.map(sub => (
                              <button key={sub} onClick={() => { setCategory("Misc"); setMiscSub(sub); setMiscOpen(false); }}
                                style={{ padding: "6px 10px", borderRadius: C.radBtn, border: "none", textAlign: "left", cursor: "pointer", fontSize: 13, background: miscSub === sub ? C.hov : "none", color: miscSub === sub ? C.gold : C.t2, fontWeight: miscSub === sub ? 600 : 500 }}>
                                {t(sub)}
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
                <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em" }}>{t("LOADING CATEGORIES…")}</div>
              ) : (
                <CategoryTable category={category} allCategories={allCategories} miscSub={miscSub} />
              )}
            </section>
          </>
        )}

        {view === "pages" && page === "farmvalue" && <FarmValuePage />}
      </main>

      <Footer status={status} />
    </div>
  );
};

export default App;