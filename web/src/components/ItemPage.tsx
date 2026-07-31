import { useEffect, useState } from "react";
import { ExternalLinkIcon, SmallPlatIcon } from "./Icons";
import { ItemChart } from "./ItemChart";
import {
  C, CardCorner, CategoryBadge, FilterLabel, ItemThumb, MISC_SUB_COLORS, RARITY_COLORS,
  T, TextLink, VitFlourish, marketUrl, plat, pctChange, segBtn,
} from "./shared";
import { A, itemPath, navigate } from "../router";
import { itemName, locale, t, useI18n } from "../i18n";
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
  if (!iso) return t("no trades in 48h");
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60)   return t("last traded %d min ago", mins);
  if (mins < 1440) return t("last traded %d h ago", Math.round(mins / 60));
  return t("last traded %d days ago", Math.round(mins / 1440));
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
    fontSize: 12, color: C.t2, fontWeight: 500, letterSpacing: "0.1em",
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
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
      <thead>
        <tr>
          <TH>{t("RELIC")}</TH>
          <TH>{t("RARITY")}</TH>
          {REFINEMENTS.map(r => <TH key={r.key} right>{t(r.label).toUpperCase()}</TH>)}
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
                    fontFamily: "monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.08em",
                    color: eraColor, background: `${eraColor}18`,
                    border: `1px solid ${eraColor}44`, borderRadius: C.rad, padding: "1px 6px",
                  }}>
                    {(s.relic_era ?? "?").toUpperCase()}
                  </span>
                  <span style={{ ...T.bodyStrong }}>{s.relic_name}</span>
                </div>
              </td>
              <td style={{ ...TD_BASE, fontFamily: "monospace", fontSize: 12, color: rarColor, fontWeight: 700, letterSpacing: "0.04em" }}>
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
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
      <Card title={t("Drop sources")} accent={C.up}>
        <div style={{ padding: "32px 16px", textAlign: "center", ...T.body, fontStyle: "italic" }}>
          {t("No drop sources known")}
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
    <Card title={t("Drop sources")} accent={C.up} sub={t("%d sources", sources.length)} right={<VitFlourish />}>
      {relics.length   > 0 && section(t("RELICS"),   relics.length,   <RelicTable sources={relics} />)}
      {enemies.length  > 0 && section(t("ENEMIES"),  enemies.length,  <TableSourceList sources={enemies} accent={C.cy} />)}
      {missions.length > 0 && section(t("MISSIONS"), missions.length, <TableSourceList sources={missions} accent={C.up} />)}
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
    <Card title={t("Relic contents")} accent={C.cy} sub={t("%d possible rewards", contents.length)} right={<VitFlourish />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <TH>{t("ITEM")}</TH>
              <TH>{t("RARITY")}</TH>
              <TH right>{t("INTACT")}</TH>
              <TH right>{t("RADIANT")}</TH>
              <TH right>{t("PRICE")}</TH>
            </tr>
          </thead>
          <tbody>
            {contents.map(c => {
              const rarColor = RARITY_COLORS[c.rarity ?? ""] ?? C.t3;
              return (
                <LinkedRow key={c.slug} slug={c.slug}>
                  <td style={TD_BASE}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <ItemThumb path={c.thumb_path} name={itemName(c)} size={24} />
                      <A href={itemPath(c.slug)} style={T.bodyStrong}>{itemName(c)}</A>
                    </div>
                  </td>
                  <td style={{ ...TD_BASE, fontFamily: "monospace", fontSize: 12, color: rarColor, fontWeight: 700, letterSpacing: "0.04em" }}>
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
              {t("AVERAGE VALUE")} {t(e.label).toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: C.cy }}>
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
    <Card title={t("Set & parts")} accent="#8a7eb8" sub={t("%d parts", pieces.length)} right={<VitFlourish />}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              <TH>{t("ITEM")}</TH>
              <TH right>{t("PRICE")}</TH>
              <TH right>{t("DUCATS")}</TH>
              <TH right>{t("VOL")}</TH>
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
                      <ItemThumb path={p.thumb_path} name={itemName(p)} size={24} />
                      <A href={itemPath(p.slug)} style={{ color: isCurrent ? C.gold : C.t, fontWeight: p.is_set ? 700 : 500 }}>
                        {itemName(p)}
                      </A>
                      {p.is_set && (
                        <span style={{
                          fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: C.t2,
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
                    {p.volume?.toLocaleString(locale()) ?? "—"}
                  </td>
                </LinkedRow>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", background: "rgba(0,0,0,0.18)" }}>
        {[
          { label: t("SUM OF PARTS"), value: <>{plat(piecesSum)}<SmallPlatIcon /></>, color: C.t },
          { label: t("SET PRICE"),    value: <>{plat(setPrice)}<SmallPlatIcon /></>,    color: C.gold },
          {
            label: t("DIFFERENCE"),
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
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "9px 18px", ...T.meta, borderTop: `1px solid ${C.b}` }}>
        {t("A positive difference means the set trades higher than the sum of its parts.")}
      </div>
    </Card>
  );
};

// ─── ItemPage ─────────────────────────────────────────────────────────────────

export const ItemPage = ({ slug }: { slug: string }) => {
  // Am Sprach-Context hängen, damit ein Umschalten sofort durchschlägt: t()
  // liest die Sprache aus einer Modulvariablen und löst von sich aus kein
  // Neuzeichnen aus.
  useI18n();
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

  // cancelled-Flag wie beim Detail-Effekt darüber: beim schnellen Durchklicken
  // der Zeiträume kann eine ältere Antwort nach der aktuellen eintreffen und sie
  // überschreiben. Sichtbar wurde das als springende Punktzahl im Chart.
  useEffect(() => {
    let cancelled = false;
    setHistLoading(true);
    (async () => {
      try {
        const params = new URLSearchParams({ hours: String(hours) });
        if (modRank != null) params.set("mod_rank", String(modRank));
        const res  = await fetch(`/api/item/${encodeURIComponent(slug)}/history?${params}`);
        const json = await res.json();
        if (!cancelled) setHistory(json);
      } catch { /* keep */ }
      finally { if (!cancelled) setHistLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [slug, hours, modRank]);

  const backLink = (
    <A href="/" style={{ ...T.meta, display: "inline-block", marginBottom: 12 }}>
      ← {t("Back to overview")}
    </A>
  );

  if (loading) {
    return (
      <>
        {backLink}
        <div style={{
          background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
          padding: "60px 16px", textAlign: "center", color: C.t2,
          fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 13,
        }}>
          {t("LOADING…")}
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
          <div style={{ fontSize: 17, fontWeight: 600, color: C.t, marginBottom: 6 }}>{t("Item not found")}</div>
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

  // Ohne jeden Handel bleibt nur das Orderbuch. Bewusst mit eigenem Label statt
  // unter „AKTUELLER PREIS": ein Angebot ist kein Handelspreis — es sagt, was
  // jemand verlangt, nicht was jemand gezahlt hat. Beides unter derselben
  // Überschrift zu zeigen, wäre genau die stille Vermischung, die die
  // Datenqualitätsregeln des Projekts untersagen.
  const offerOnly = headlinePrice == null && item.sell_price_min != null;

  const kpis: { label: string; value: React.ReactNode; sub: React.ReactNode; color: string }[] = [
    offerOnly ? {
      label: t("OFFERED FROM"), color: C.cy,
      value: <>{plat(item.sell_price_min)}<SmallPlatIcon /></>,
      sub: item.sell_price_rank != null
        ? t("Lowest offer, rank %d", item.sell_price_rank)
        : t("Lowest offer"),
    } : {
      label: t("CURRENT PRICE"), color: C.gold,
      value: <>{plat(headlinePrice)}<SmallPlatIcon /></>,
      sub: priceIs48h ? t("Average of the last 48h") : t("Average of the last 24h"),
    },
    {
      label: t("CHANGE 24 H"), color: up ? C.up : C.down,
      value: changed,
      sub: t("Against 24–48h before"),
    },
    {
      label: t("PRICE RANGE 48 H"), color: C.t,
      value: <>{plat(item.min_price_48h)} – {plat(item.max_price_48h)}<SmallPlatIcon /></>,
      sub: <>{plat(spread)} {t("difference")} ({spreadPct}%)</>,
    },
    {
      label: t("TRADE VOLUME"), color: C.cy,
      value: (item.volume_24h ?? 0).toLocaleString(locale()),
      sub: <>{t("%s in 48h", (item.volume_48h ?? 0).toLocaleString(locale()))}</>,
    },
  ];

  if (platPerDucat != null) {
    kpis.push({
      label: t("DUCAT EFFICIENCY"), color: "#c89050",
      value: `${platPerDucat.toFixed(3)}`,
      sub: <>{t("₱ per ducat · %d ducats", item.ducats ?? 0)}</>,
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
            <ItemThumb path={item.image_path ?? item.thumb_path} name={itemName(item)} size={72} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.t, lineHeight: 1.2 }}>
                {itemName(item)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <CategoryBadge cat={item.category} />
                {item.subcategory && (
                  <span style={{
                    fontSize: 12, padding: "2px 7px", borderRadius: C.rad,
                    color: MISC_SUB_COLORS[item.subcategory] ?? C.t3,
                    background: `${MISC_SUB_COLORS[item.subcategory] ?? C.t3}18`,
                    border: `1px solid ${MISC_SUB_COLORS[item.subcategory] ?? C.t3}30`,
                  }}>
                    {item.subcategory}
                  </span>
                )}
                {item.max_rank != null && item.max_rank > 0 && (
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: C.rad,
                    border: `1px solid ${C.b2}`, color: C.gold,
                    background: "rgba(200,168,75,0.1)",
                  }}>
                    R{item.max_rank}
                  </span>
                )}
                {item.ducats != null && item.ducats > 0 && (
                  <span style={{
                    fontSize: 13, fontWeight: 500, padding: "2px 8px", borderRadius: C.rad,
                    border: "1px solid #c8905044", color: "#c89050", background: "#c8905014",
                  }}>
                    {item.ducats} Ducats
                  </span>
                )}
              </div>
              <div style={{ ...T.meta, marginTop: 8 }}>
                <TextLink href={marketUrl(slug)} target="_blank" rel="noopener noreferrer"
                  title={t("View on warframe.market — opens a new tab")}>
                  warframe.market<ExternalLinkIcon />
                </TextLink>
              </div>
            </div>
          </div>

          {/* Bewusst OHNE „AKTUELLER PREIS"-Label, anders als im Dashboard-
              Detailpanel: die KPI-Leiste direkt darunter trägt genau dieses Label
              bereits, auf denselben Wert (headlinePrice). Zweimal dasselbe Wort
              auf 100px erklärt nichts, es verdoppelt nur. Im Dashboard fehlt eine
              solche Kachel, dort trägt das Label Information. */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {/* Bei Items ohne Handel steht hier das Angebot — in C.cy statt Gold,
                damit schon die Farbe sagt, dass es eine andere Größe ist. */}
            <div style={{ ...T.hero, color: offerOnly ? C.cy : C.gold }}>
              {plat(offerOnly ? item.sell_price_min : headlinePrice)}<SmallPlatIcon />
            </div>
            {!offerOnly && (
              <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, marginTop: 4, color: up ? C.up : C.down }}>
                {changed}
              </div>
            )}
            <div style={{ ...T.meta, marginTop: 5 }}>
              {offerOnly ? t("no trades, lowest offer") : lastTradeLabel(item.last_trade)}
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
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: s.color, lineHeight: 1.1 }}>
                {s.value}
              </div>
              <div style={{ ...T.meta, marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Chart ── */}
      <Card
        title={t("Price history")}
        sub={history?.resolution === "hour" ? t("hourly resolution") : t("daily resolution")}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3 }}>
              {RANGES.map(r => (
                <button key={r.hours} onClick={() => setHours(r.hours)} style={segBtn(hours === r.hours)}>
                  {t(r.label)}
                </button>
              ))}
            </div>
            {item.mod_ranks && item.mod_ranks.length > 1 && (
              <>
                <div style={{ width: 1, height: 16, background: C.b }} />
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <FilterLabel>{t("RANK")}</FilterLabel>
                  <button onClick={() => setModRank(null)} style={segBtn(modRank === null, C.cy)}>{t("All")}</button>
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
              color: C.t2, fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em",
            }}>
              {t("LOADING…")}
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
