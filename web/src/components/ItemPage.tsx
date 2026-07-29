import { useCallback, useEffect, useState } from "react";
import { SmallPlatIcon } from "./Icons";
import { ItemChart } from "./ItemChart";
import {
  C, CardCorner, CategoryBadge, FilterLabel, ItemThumb, MISC_SUB_COLORS, RARITY_COLORS,
  T, VitFlourish, plat, pctChange, segBtn,
} from "./shared";
import { A, itemPath, navigate } from "../router";
import type {
  DropSource, HistoryResponse, ItemDetailResponse, RelicContent, SetPart,
} from "../types";

// ─── Konstanten ───────────────────────────────────────────────────────────────

const RANGES = [
  { hours: 48,  label: "48H" },
  { hours: 168, label: "7T"  },
  { hours: 336, label: "14T" },
  { hours: 720, label: "30T" },
  { hours: 2160, label: "90T" },
];

const ERA_COLORS: Record<string, string> = {
  Lith:     "#a8b8c8",
  Meso:     "#c8a84b",
  Neo:      "#7ab8d4",
  Axi:      "#c87a50",
  Requiem:  "#b87ab8",
  Vanguard: "#4dba7f",
};

const REFINEMENTS = [
  { key: "drop_chance_intact",      label: "Intact"      },
  { key: "drop_chance_exceptional", label: "Exceptional" },
  { key: "drop_chance_flawless",    label: "Flawless"    },
  { key: "drop_chance_radiant",     label: "Radiant"     },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "EidolonRifleLancerDropTable" → "Eidolon Rifle Lancer" */
const prettifyTable = (name?: string | null) =>
  (name ?? "—").replace(/DropTable$/, "").replace(/Rewards$/, "").replace(/([A-Z])/g, " $1").trim();

const pct = (v?: number | null, digits = 2) =>
  v != null && v > 0 ? `${(v * 100).toFixed(digits)}%` : "—";

const lastTradeLabel = (iso?: string | null) => {
  if (!iso) return "keine Trades in 48h";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60)   return `zuletzt gehandelt vor ${mins} Min`;
  if (mins < 1440) return `zuletzt gehandelt vor ${Math.round(mins / 60)} Std`;
  return `zuletzt gehandelt vor ${Math.round(mins / 1440)} Tagen`;
};

// ─── Karten-Gerüst ────────────────────────────────────────────────────────────

const Card = ({
  title, accent = C.gold, sub, right, children,
}: {
  title: string; accent?: string; sub?: React.ReactNode;
  right?: React.ReactNode; children: React.ReactNode;
}) => (
  <section style={{
    background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
    marginBottom: 14, overflow: "hidden", position: "relative", backdropFilter: "blur(10px)",
  }}>
    <CardCorner />
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
      background: "rgba(0,0,0,0.18)", gap: 10, flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 2, height: 15, borderRadius: 1, background: accent, flexShrink: 0 }} />
        <div>
          <div style={T.cardTitle}>{title}</div>
          {sub && <div style={{ ...T.meta, marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {right}
    </div>
    {children}
  </section>
);

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th style={{
    padding: "9px 14px", textAlign: right ? "right" : "left",
    fontSize: 11, color: C.t2, fontWeight: 500, letterSpacing: "0.1em",
    borderBottom: `1px solid ${C.b}`, whiteSpace: "nowrap",
  }}>
    {children}
  </th>
);

const TD_BASE: React.CSSProperties = { padding: "9px 14px", borderBottom: `1px solid ${C.b}` };

const LinkedRow = ({ slug, children }: { slug: string; children: React.ReactNode }) => (
  <tr
    style={{ cursor: "pointer", transition: "background 0.1s" }}
    onClick={() => navigate(itemPath(slug))}
    onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
  >
    {children}
  </tr>
);

// ─── Drop-Quellen ─────────────────────────────────────────────────────────────

const RelicTable = ({ sources }: { sources: DropSource[] }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <TH>RELIC</TH>
          <TH>RARITY</TH>
          {REFINEMENTS.map(r => <TH key={r.key} right>{r.label.toUpperCase()}</TH>)}
        </tr>
      </thead>
      <tbody>
        {sources.map((s, i) => {
          const eraColor = ERA_COLORS[s.relic_era ?? ""] ?? C.t3;
          const rarColor = RARITY_COLORS[s.rarity ?? ""] ?? C.t3;
          return (
            <tr key={i}>
              <td style={TD_BASE}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontFamily: "monospace", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                    color: eraColor, background: `${eraColor}18`,
                    border: `1px solid ${eraColor}44`, borderRadius: C.rad, padding: "1px 6px",
                  }}>
                    {(s.relic_era ?? "?").toUpperCase()}
                  </span>
                  <span style={{ ...T.bodyStrong }}>{s.relic_name}</span>
                </div>
              </td>
              <td style={{ ...TD_BASE, fontFamily: "monospace", fontSize: 11, color: rarColor, fontWeight: 700, letterSpacing: "0.04em" }}>
                {s.rarity ?? "—"}
              </td>
              {REFINEMENTS.map(r => (
                <td key={r.key} style={{
                  ...TD_BASE, textAlign: "right", ...T.numSmall,
                  color: r.key === "drop_chance_radiant" ? C.up : C.t2,
                }}>
                  {pct(s[r.key])}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const TableSourceList = ({ sources, accent }: { sources: DropSource[]; accent: string }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <TH>QUELLE</TH>
          <TH right>CHANCE</TH>
        </tr>
      </thead>
      <tbody>
        {sources.map((s, i) => (
          <tr key={i}>
            <td style={{ ...TD_BASE, ...T.body }}>
              {prettifyTable(s.droptable_name)}
            </td>
            <td style={{ ...TD_BASE, textAlign: "right", ...T.num, color: accent }}>
              {pct(s.drop_chance_enemy ?? s.drop_chance_best, 3)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const DropSourcesCard = ({ sources }: { sources: DropSource[] }) => {
  const relics   = sources.filter(s => s.source_type === "relic");
  const enemies  = sources.filter(s => s.source_type === "enemy");
  const missions = sources.filter(s => s.source_type === "mission");

  if (sources.length === 0) {
    return (
      <Card title="Drop-Quellen" accent={C.up}>
        <div style={{ padding: "32px 16px", textAlign: "center", ...T.body, fontStyle: "italic" }}>
          Keine Drop-Quellen bekannt
        </div>
      </Card>
    );
  }

  const section = (label: string, count: number, node: React.ReactNode) => (
    <div key={label}>
      <div style={{
        padding: "8px 18px", background: "rgba(0,0,0,0.12)",
        ...T.label,
        borderBottom: `1px solid ${C.b}`,
      }}>
        {label} · {count}
      </div>
      {node}
    </div>
  );

  return (
    <Card title="Drop-Quellen" accent={C.up} sub={`${sources.length} Quellen`} right={<VitFlourish />}>
      {relics.length   > 0 && section("RELICS",    relics.length,   <RelicTable sources={relics} />)}
      {enemies.length  > 0 && section("GEGNER",    enemies.length,  <TableSourceList sources={enemies} accent={C.cy} />)}
      {missions.length > 0 && section("MISSIONEN", missions.length, <TableSourceList sources={missions} accent={C.up} />)}
    </Card>
  );
};

// ─── Relic-Inhalt ─────────────────────────────────────────────────────────────

const RelicContentsCard = ({ contents }: { contents: RelicContent[] }) => {
  // Erwarteter Wert je Refinement: Σ (Chance × aktueller Preis)
  const expected = REFINEMENTS.map(r => ({
    label: r.label,
    value: contents.reduce((sum, c) => sum + (c[r.key] ?? 0) * (c.avg_price ?? 0), 0),
  }));

  return (
    <Card title="Relic-Inhalt" accent={C.cy} sub={`${contents.length} mögliche Belohnungen`} right={<VitFlourish />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <TH>ITEM</TH>
              <TH>RARITY</TH>
              <TH right>INTACT</TH>
              <TH right>RADIANT</TH>
              <TH right>PREIS</TH>
            </tr>
          </thead>
          <tbody>
            {contents.map(c => {
              const rarColor = RARITY_COLORS[c.rarity ?? ""] ?? C.t3;
              return (
                <LinkedRow key={c.slug} slug={c.slug}>
                  <td style={TD_BASE}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <ItemThumb path={c.thumb_path} name={c.name} size={24} />
                      <A href={itemPath(c.slug)} style={T.bodyStrong}>{c.name}</A>
                    </div>
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: "monospace", fontSize: 11, color: rarColor, fontWeight: 700, letterSpacing: "0.04em" }}>
                    {c.rarity ?? "—"}
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.numSmall, color: C.t2 }}>
                    {pct(c.drop_chance_intact)}
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.numSmall, color: C.up }}>
                    {pct(c.drop_chance_radiant)}
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.num, color: C.gold }}>
                    {plat(c.avg_price)}<SmallPlatIcon />
                  </td>
                </LinkedRow>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", background: "rgba(0,0,0,0.18)" }}>
        {expected.map((e, i, arr) => (
          <div key={e.label} style={{
            flex: "1 1 120px", padding: "11px 18px",
            borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none",
          }}>
            <div style={{ ...T.label, marginBottom: 5 }}>
              ⌀ WERT {e.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: C.cy }}>
              {plat(e.value)}<SmallPlatIcon />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ─── Set ↔ Einzelteile ────────────────────────────────────────────────────────

const SetPartsCard = ({ parts, currentSlug }: { parts: SetPart[]; currentSlug: string }) => {
  const setRow    = parts.find(p => p.is_set);
  const pieces    = parts.filter(p => !p.is_set);
  const piecesSum = pieces.reduce((s, p) => s + (p.avg_price ?? 0), 0);
  const setPrice  = setRow?.avg_price ?? null;
  // Positiv = Set ist teurer als die Summe der Teile (lohnt sich einzeln zu verkaufen)
  const diff      = setPrice != null ? setPrice - piecesSum : null;
  const diffPct   = diff != null && piecesSum > 0 ? (diff / piecesSum) * 100 : null;

  return (
    <Card title="Set & Einzelteile" accent="#8a7eb8" sub={`${pieces.length} Teile`} right={<VitFlourish />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <TH>ITEM</TH>
              <TH right>PREIS</TH>
              <TH right>DUCATS</TH>
              <TH right>VOL</TH>
            </tr>
          </thead>
          <tbody>
            {parts.map(p => {
              const isCurrent = p.slug === currentSlug;
              return (
                <LinkedRow key={p.slug} slug={p.slug}>
                  <td style={{
                    ...TD_BASE,
                    borderLeft: isCurrent ? `2px solid ${C.gold}` : "2px solid transparent",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <ItemThumb path={p.thumb_path} name={p.name} size={24} />
                      <A href={itemPath(p.slug)} style={{ color: isCurrent ? C.gold : C.t, fontWeight: p.is_set ? 700 : 500 }}>
                        {p.name}
                      </A>
                      {p.is_set && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: C.t2,
                          border: `1px solid ${C.b}`, borderRadius: C.rad, padding: "1px 5px",
                        }}>
                          SET
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.num, color: C.gold }}>
                    {plat(p.avg_price)}<SmallPlatIcon />
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.numSmall, color: C.t2 }}>
                    {p.ducats ?? "—"}
                  </td>
                  <td style={{ ...TD_BASE, textAlign: "right", ...T.numSmall, color: C.t2 }}>
                    {p.volume?.toLocaleString("de-DE") ?? "—"}
                  </td>
                </LinkedRow>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", background: "rgba(0,0,0,0.18)" }}>
        {[
          { label: "SUMME TEILE", value: <>{plat(piecesSum)}<SmallPlatIcon /></>, color: C.t },
          { label: "SET-PREIS",   value: <>{plat(setPrice)}<SmallPlatIcon /></>,       color: C.gold },
          {
            label: "DIFFERENZ",
            value: diff != null
              ? <>{diff >= 0 ? "+" : "−"}{plat(Math.abs(diff))}<SmallPlatIcon />{diffPct != null && ` (${diffPct >= 0 ? "+" : "−"}${Math.abs(diffPct).toFixed(0)}%)`}</>
              : "—",
            color: diff == null ? C.t3 : diff >= 0 ? C.up : C.down,
          },
        ].map((s, i, arr) => (
          <div key={s.label} style={{
            flex: "1 1 140px", padding: "11px 18px",
            borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none",
          }}>
            <div style={{ ...T.label, marginBottom: 5 }}>
              {s.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "9px 18px", ...T.meta, borderTop: `1px solid ${C.b}` }}>
        Positive Differenz = das Set wird teurer gehandelt als die Summe seiner Teile.
      </div>
    </Card>
  );
};

// ─── ItemPage ─────────────────────────────────────────────────────────────────

export const ItemPage = ({ slug }: { slug: string }) => {
  const [data,    setData]    = useState<ItemDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [hours,   setHours]   = useState(168);
  const [modRank, setModRank] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setData(null);
    setModRank(null);

    (async () => {
      try {
        const res = await fetch(`/api/item/${encodeURIComponent(slug)}/detail`);
        if (res.status === 404) { if (!cancelled) setNotFound(true); return; }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [slug]);

  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const params = new URLSearchParams({ hours: String(hours) });
      if (modRank != null) params.set("mod_rank", String(modRank));
      const res  = await fetch(`/api/item/${encodeURIComponent(slug)}/history?${params}`);
      const json = await res.json();
      setHistory(json);
    } catch { /* keep */ }
    finally { setHistLoading(false); }
  }, [slug, hours, modRank]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const backLink = (
    <A href="/" style={{ ...T.meta, display: "inline-block", marginBottom: 12 }}>
      ← Zurück zur Übersicht
    </A>
  );

  if (loading) {
    return (
      <>
        {backLink}
        <div style={{
          background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
          padding: "60px 16px", textAlign: "center", color: C.t2,
          fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 12,
        }}>
          LADEN...
        </div>
      </>
    );
  }

  if (notFound || !data) {
    return (
      <>
        {backLink}
        <div style={{
          background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
          padding: "50px 16px", textAlign: "center",
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.t, marginBottom: 6 }}>Item nicht gefunden</div>
          <div style={{ ...T.meta, fontFamily: "monospace" }}>{slug}</div>
        </div>
      </>
    );
  }

  const { item, drop_sources, relic_contents, set_parts } = data;
  const up      = (item.change_pct ?? 0) >= 0;
  const changed = pctChange(item.change_pct);
  const spread  = (item.max_price_48h ?? 0) - (item.min_price_48h ?? 0);
  const spreadPct = item.avg_price_48h ? ((spread / item.avg_price_48h) * 100).toFixed(0) : "—";
  // Ohne Trades in den letzten 24h auf das 48h-Fenster zurückfallen, statt "—" zu zeigen
  const headlinePrice = item.avg_price_24h ?? item.avg_price_48h;
  const priceIs48h    = item.avg_price_24h == null && item.avg_price_48h != null;
  const platPerDucat  = item.ducats && item.ducats > 0 && headlinePrice != null
    ? headlinePrice / item.ducats
    : null;

  const kpis: { label: string; value: React.ReactNode; sub: React.ReactNode; color: string }[] = [
    {
      label: "AKTUELLER PREIS", color: C.gold,
      value: <>{plat(headlinePrice)}<SmallPlatIcon /></>,
      sub: priceIs48h ? "⌀ der letzten 48h" : "⌀ der letzten 24h",
    },
    {
      label: "VERÄNDERUNG 24 H", color: up ? C.up : C.down,
      value: changed,
      sub: "vs. 24–48h davor",
    },
    {
      label: "PREISSPANNE 48 H", color: C.t,
      value: <>{plat(item.min_price_48h)} – {plat(item.max_price_48h)}<SmallPlatIcon /></>,
      sub: <>{plat(spread)} Differenz ({spreadPct}%)</>,
    },
    {
      label: "HANDELSVOLUMEN", color: C.cy,
      value: (item.volume_24h ?? 0).toLocaleString("de-DE"),
      sub: <>{(item.volume_48h ?? 0).toLocaleString("de-DE")} in 48h</>,
    },
  ];

  if (platPerDucat != null) {
    kpis.push({
      label: "DUCAT-EFFIZIENZ", color: "#c89050",
      value: `${platPerDucat.toFixed(3)}`,
      sub: <>₱ pro Ducat · {item.ducats} Ducats</>,
    });
  }

  return (
    <>
      {backLink}

      {/* ── Hero ── */}
      <section style={{
        background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
        marginBottom: 14, position: "relative", backdropFilter: "blur(10px)", overflow: "hidden",
      }}>
        <CardCorner />
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 16, padding: "18px 22px", flexWrap: "wrap",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
            <ItemThumb path={item.image_path ?? item.thumb_path} name={item.name} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.t, lineHeight: 1.2 }}>
                {item.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <CategoryBadge cat={item.category} />
                {item.subcategory && (
                  <span style={{
                    fontSize: 11, padding: "2px 7px", borderRadius: C.rad,
                    color: MISC_SUB_COLORS[item.subcategory] ?? C.t3,
                    background: `${MISC_SUB_COLORS[item.subcategory] ?? C.t3}18`,
                    border: `1px solid ${MISC_SUB_COLORS[item.subcategory] ?? C.t3}30`,
                  }}>
                    {item.subcategory}
                  </span>
                )}
                {item.max_rank != null && item.max_rank > 0 && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: C.rad,
                    border: `1px solid ${C.b2}`, color: C.gold,
                    background: "rgba(200,168,75,0.1)",
                  }}>
                    R{item.max_rank}
                  </span>
                )}
                {item.ducats != null && item.ducats > 0 && (
                  <span style={{
                    fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: C.rad,
                    border: "1px solid #c8905044", color: "#c89050", background: "#c8905014",
                  }}>
                    {item.ducats} Ducats
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "monospace", color: C.gold, lineHeight: 1 }}>
              {plat(headlinePrice)}<SmallPlatIcon />
            </div>
            <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, marginTop: 4, color: up ? C.up : C.down }}>
              {changed}
            </div>
            <div style={{ ...T.meta, marginTop: 5 }}>
              {lastTradeLabel(item.last_trade)}
            </div>
          </div>
        </div>

        {/* KPI-Leiste */}
        <div style={{ display: "flex", borderTop: `1px solid ${C.b}`, flexWrap: "wrap" }}>
          {kpis.map((s, i, arr) => (
            <div key={s.label} style={{
              flex: "1 1 160px", padding: "13px 20px",
              borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none",
            }}>
              <div style={{ ...T.label, marginBottom: 6 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: s.color, lineHeight: 1.1 }}>
                {s.value}
              </div>
              <div style={{ ...T.meta, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Chart ── */}
      <Card
        title="Preisverlauf"
        sub={history?.resolution === "hour" ? "stündliche Auflösung" : "tägliche Auflösung"}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {RANGES.map(r => (
                <button key={r.hours} onClick={() => setHours(r.hours)} style={segBtn(hours === r.hours)}>
                  {r.label}
                </button>
              ))}
            </div>
            {item.mod_ranks && item.mod_ranks.length > 1 && (
              <>
                <div style={{ width: 1, height: 16, background: C.b }} />
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <FilterLabel>RANG</FilterLabel>
                  <button onClick={() => setModRank(null)} style={segBtn(modRank === null, C.cy)}>Alle</button>
                  {item.mod_ranks.map(r => (
                    <button key={r} onClick={() => setModRank(r)} style={segBtn(modRank === r, C.cy)}>
                      R{r}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        }
      >
        <div style={{ padding: "12px 16px 10px", height: 380 }}>
          {histLoading && !history ? (
            <div style={{
              height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              color: C.t2, fontFamily: "monospace", fontSize: 12, letterSpacing: "0.15em",
            }}>
              LADEN...
            </div>
          ) : (
            <ItemChart points={history?.points ?? []} resolution={history?.resolution ?? "day"} minHeight={340} />
          )}
        </div>
      </Card>

      {/* ── Kontextblöcke ── */}
      {relic_contents.length > 0 && <RelicContentsCard contents={relic_contents} />}
      <DropSourcesCard sources={drop_sources} />
      {set_parts.length > 1 && <SetPartsCard parts={set_parts} currentSlug={item.slug} />}
    </>
  );
};
