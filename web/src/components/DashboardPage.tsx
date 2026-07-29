import { useState, useEffect, useCallback, useMemo } from "react";
import { SmallPlatIcon, TradeIcon, TrendDownIcon, TrendUpIcon, ValueIcon } from "./Icons";
import { ItemChart } from "./ItemChart";
import { C, T, TextLink, hoverSurface, plat, pctChange, segBtn, segBtnHover } from "./shared";
import { A, itemPath } from "../router";
import type { HistoryResponse, TopItem } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
  top_loser:     TopItem[];   // echte Verlierer, seit /api/top sie separat liefert
  top_seller:    TopItem[];
  top_traded:    TopItem[];
}

interface FarmItem {
  name:     string;
  cat:      string;
  icon:     string;
  source:   string;
  src_type: "relic" | "enemy";
  price:    number;
  drop_pct: number;
  ratio:    number;
  vol:      number;
}

export type ChangeMetric = "pct" | "abs";

const METRIC_KEY = "vw:change-metric";

export const saveMetric = (m: ChangeMetric) => {
  try { localStorage.setItem(METRIC_KEY, m); } catch { /* Privatmodus */ }
};

export const loadMetric = (): ChangeMetric => {
  try {
    return localStorage.getItem(METRIC_KEY) === "abs" ? "abs" : "pct";
  } catch {
    return "pct";
  }
};

/**
 * Veränderung in der gewählten Einheit. Prozent bei günstigen Items ist
 * strukturell irreführend (0,22 → 0,67 ₱ sind +203 %, aber 0,45 Platin),
 * deshalb die Platin-Differenz als gleichwertige Alternative.
 */
const formatChange = (item: TopItem, metric: ChangeMetric): string => {
  if (metric === "abs") {
    const v = item.change_abs;
    if (v == null) return "—";
    // Nicht plat(): das hebt jeden Wert auf mindestens 1 an und machte aus
    // −0,01 ₱ ein „−1". Unter einem halben Platin steht schlicht „0".
    const r = Math.round(v);
    if (r === 0) return "0";
    return `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
  }
  return pctChange(item.change_pct);
};

/**
 * Farbe zur angezeigten Veränderung. Neutral, sobald der ANGEZEIGTE Wert null
 * ist — im Platin-Modus rundet alles unter einem halben Platin auf „0", und ein
 * rotes „0 ₱ über 24H" behauptet einen Rückgang, den die Zahl nicht zeigt.
 */
const changeColor = (item: TopItem, metric: ChangeMetric): string => {
  const v = metric === "abs"
    ? (item.change_abs == null ? null : Math.round(item.change_abs))
    : item.change_pct;
  if (v == null || v === 0) return C.t2;
  return v > 0 ? C.up : C.down;
};

/**
 * Angezeigter Preis eines Items: der letzte Punkt der Zeitreihe, nicht das Mittel
 * über den Zeitraum. Sonst widerspricht die Zeile sich selbst — „998 (+524)" bei
 * einem Verlauf von 501 auf 1025 ließ sich nicht zusammenrechnen, weil die 998 das
 * Fenstermittel waren und die 524 die Differenz der Ränder.
 * Fallback auf avg_price, falls die API das Feld (noch) nicht liefert.
 */
const price = (item: TopItem): number | null | undefined =>
  item.current_price ?? item.avg_price;

/** Veränderung samt Einheit — im Platin-Modus mit Platin-Zeichen. */
const ChangeValue = ({ item, metric }: { item: TopItem; metric: ChangeMetric }) => (
  <>{formatChange(item, metric)}{metric === "abs" && item.change_abs != null && <SmallPlatIcon />}</>
);

/**
 * Volumen-Entwicklung: erster gegen letzten Balken des Volumen-Graphen, flach
 * und prozentual zugleich — „+14 (+1400 %)". Bei „Meistgehandelt" ersetzt sie die
 * Preisveränderung, denn dort ist die Handelsaktivität die Messgröße; der
 * %/₱-Umschalter wirkt hier bewusst nicht.
 *
 * Ab 100 % ohne Nachkommastelle: „+1400,0 %" täuscht eine Genauigkeit vor, die
 * ein Vergleich zweier Tageszahlen nicht hat.
 */
const formatVolumeChange = (item: TopItem): string => {
  const v = item.volume_change_abs;
  if (v == null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const flat = `${sign}${Math.abs(v).toLocaleString("de-DE")}`;
  const p    = item.volume_change_pct;
  // „Trades" dazu, weil in den übrigen Ansichten an derselben Stelle ein
  // Platinwert steht — ohne Einheit läse sich „−61" dort als Platin.
  if (p == null) return `${flat} Trades`;
  const ps = Math.abs(p) >= 100 ? Math.round(Math.abs(p)).toLocaleString("de-DE") : Math.abs(p).toFixed(1);
  return `${flat} Trades (${p >= 0 ? "+" : "−"}${ps} %)`;
};

const volumeChangeColor = (item: TopItem): string => {
  const v = item.volume_change_abs;
  if (v == null || v === 0) return C.t2;
  return v > 0 ? C.up : C.down;
};

interface DashboardPageProps {
  data:   ApiResponse | null;
  hours:  number;
  metric: ChangeMetric;
  onMetricChange: (m: ChangeMetric) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS_LABELS: Record<number, string> = {
  24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T",
};

const MOCK_FARM: FarmItem[] = [
  { name: "Adaptation",         cat: "Mods",    icon: "⚡", source: "Demolyst (Disruption)", src_type: "enemy",  price: 38.9, drop_pct: 6.67, ratio: 2.59, vol: 147 },
  { name: "Primed Flow",        cat: "Mods",    icon: "⚡", source: "Orokin Vault",           src_type: "enemy",  price: 44.0, drop_pct: 2.23, ratio: 0.98, vol: 29  },
  { name: "Condition Overload", cat: "Mods",    icon: "⚡", source: "Violacyst (Isolok)",     src_type: "enemy",  price: 31.0, drop_pct: 3.33, ratio: 1.03, vol: 62  },
  { name: "Blind Rage",         cat: "Mods",    icon: "⚡", source: "Orokin Vault",           src_type: "enemy",  price: 15.4, drop_pct: 4.45, ratio: 0.69, vol: 29  },
  { name: "Hunter Command",     cat: "Mods",    icon: "⚡", source: "Drahk Master",           src_type: "enemy",  price: 9.5,  drop_pct: 4.45, ratio: 0.42, vol: 54  },
  { name: "Arcane Energize R5", cat: "Arcanes", icon: "🔮", source: "Axi A6 Intact",          src_type: "relic",  price: 427,  drop_pct: 0.11, ratio: 0.47, vol: 12  },
  { name: "Umbral Fiber",       cat: "Mods",    icon: "⚡", source: "Sentient (Eidolon)",     src_type: "enemy",  price: 22.5, drop_pct: 1.67, ratio: 0.38, vol: 21  },
  { name: "Arcane Fury R5",     cat: "Arcanes", icon: "🔮", source: "Neo F1 Intact",          src_type: "relic",  price: 142,  drop_pct: 0.11, ratio: 0.16, vol: 18  },
];

// ─── Item Icon ────────────────────────────────────────────────────────────────
// Uses thumb_path from API if available, falls back to initials placeholder.

const ItemIcon = ({ item, size = 30 }: { item: TopItem; size?: number }) => {
  const [failed, setFailed] = useState(false);

  if (item.thumb_path && !failed) {
    return (
      <img
        src={item.thumb_path}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          borderRadius: 2, flexShrink: 0,
          objectFit: "contain", display: "block",
        }}
      />
    );
  }

  // Fallback: initials
  const initials = item.item_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 2, flexShrink: 0,
      background: "rgba(200,168,75,0.12)", border: `1px solid ${C.b}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, color: C.gold, fontWeight: 700, letterSpacing: "-0.02em",
    }}>
      {initials}
    </div>
  );
};

// ─── Switcher Card ────────────────────────────────────────────────────────────

const SwitcherCard = ({
  label, value, sub, accentColor, valueColor, active, onClick,
}: {
  label: string; value: React.ReactNode; sub: React.ReactNode;
  accentColor: string; valueColor?: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      background: active ? "rgba(10,12,40,0.95)" : C.card,
      border: `1px solid ${active ? C.b2 : C.b}`,
      borderRadius: 2, padding: "15px 18px", cursor: "pointer",
      transition: "border-color 0.15s, background 0.15s",
      position: "relative", overflow: "hidden", textAlign: "left",
      fontFamily: "system-ui, -apple-system, sans-serif", width: "100%",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.b2; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.b; }}
  >
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: active ? 1 : 0.5 }} />
    <div style={{ ...T.label, marginBottom: 7 }}>{label}</div>
    <div style={{ ...T.stat, color: valueColor ?? accentColor, marginBottom: 5 }}>{value}</div>
    <div style={{ ...T.meta, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
  </button>
);

// ─── List Item ────────────────────────────────────────────────────────────────

// Platzierung nach Warframes eigenen Stufen (Platin › Gold › Silber › Bronze,
// wie bei Mod- und Arcane-Seltenheiten).
//
// Die Werte sind so gewählt, dass die Helligkeit DURCHGEHEND fällt — sonst wirkt
// ein schlechterer Rang heller als ein besserer. Die erste Fassung hatte genau
// dieses Problem gleich doppelt: Silber (9,90:1) war heller als Gold (8,22:1),
// und Bronze (4,97:1) dunkler als die Ränge 4–10 (8,08:1).
//
// Kontrast gegen den Seitenhintergrund:
//   Platin 14,79 › Gold 8,22 › Silber 7,76 › Bronze 5,63
//
// Bronze liegt unter der Textregel aus shared.tsx (C.t2 = 8,08:1), aber über dem
// AA-Minimum von 4,5:1. Vertretbar, weil die Rangziffer redundant ist: die
// Position in der Liste nennt den Rang ohnehin.
const MEDAL = {
  platinum: "#dfe4ef",
  gold:     C.gold,
  silver:   "#9fa7b3",
  bronze:   "#bd7f42",
} as const;

const rankStyle = (rank: number): React.CSSProperties => {
  if (rank === 1) return { color: MEDAL.platinum, fontSize: 17 };
  if (rank === 2) return { color: MEDAL.gold,     fontSize: 15 };
  if (rank === 3) return { color: MEDAL.silver,   fontSize: 14 };
  return { color: MEDAL.bronze, fontSize: 12 };
};


const ListItem = ({ item, rank, active, metric, showVolumeChange, onClick }: {
  item: TopItem; rank: number; active: boolean; metric: ChangeMetric;
  showVolumeChange: boolean; onClick: () => void;
}) => {

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px", borderBottom: `1px solid ${C.b}`,
        cursor: "pointer", transition: "background 0.1s",
        display: "flex", alignItems: "center", gap: 10,
        background: active ? "rgba(200,168,75,0.09)" : "transparent",
        borderLeft: active ? `2px solid ${C.gold}` : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.hov; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(200,168,75,0.09)" : "transparent"; }}
    >
      <span style={{ ...T.numSmall, ...rankStyle(rank), minWidth: 20, textAlign: "center" }}>{rank}</span>
      <ItemIcon item={item} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bewusst kein Link: die Liste wählt nur die Detailansicht aus.
            Zur Item-Seite geht es ausschließlich über Titel oder Bild im Detail. */}
        <div style={{ ...T.bodyStrong, color: active ? C.gold : C.t, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.item_name}
        </div>
        <div style={{ ...T.meta, marginTop: 2 }}>
          {item.max_rank != null && item.max_rank > 0 ? `R${item.max_rank} · ` : ""}Vol {item.volume}
          {/* Der angezeigte Wert bleibt immer der echte — hier steht nur, worauf
              er beruht. Schwelle 0,25 entspricht bei m = 30 rund zehn Trades.
              (Mit dem früheren m = 10 stand hier 0,5 für dieselben zehn Trades;
              unverändert übernommen hätte sie jetzt bei dreißig gegriffen.) */}
          {item.confidence != null && item.confidence < 0.25 && (
            <span title={`Nur ${item.volume} Trades — Wert wenig belastbar`}
              style={{ color: C.t3, fontStyle: "italic" }}>
              {" · dünne Datenlage"}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {/* Preis und Veränderung in einer Zeile: zuvor trug jede der beiden
            Zeilen ein eigenes Platin-Icon, was den Blick verdoppelte. */}
        <div style={{ ...T.num, color: C.gold, whiteSpace: "nowrap" }}>
          {plat(price(item))}
          {!showVolumeChange && (
            <span style={{ ...T.numSmall, marginLeft: 5, color: changeColor(item, metric) }}>
              ({formatChange(item, metric)})
            </span>
          )}
          <SmallPlatIcon />
        </div>
        {showVolumeChange && (
          <div style={{ ...T.numSmall, marginTop: 2, color: volumeChangeColor(item), whiteSpace: "nowrap" }}
            title="Trades am letzten gegen Trades am ersten Punkt des Zeitraums">
            {formatVolumeChange(item)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

// Kein eigener Zeitraum mehr: der Graph folgt dem Seiten-Selektor. Vorher liefen
// beide auseinander, wodurch die Kennzahlenzeile zwei verschiedene Zeiträume
// vermischte (Eröffnung aus dem Graph-Fenster, Veränderung aus dem Seiten-Fenster).
// Tiefe Historie mit eigenem Zeitraum gibt es weiterhin auf der Item-Seite.
const DetailPanel = ({ item, hours, metric }: { item: TopItem; hours: number; metric: ChangeMetric }) => {
  const [history, setHistory]     = useState<HistoryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(true);

  const changeCol = changeColor(item, metric);
  const pct = <ChangeValue item={item} metric={metric} />;
  const spread = item.max_price - item.min_price;
  const spreadPct = ((spread / item.avg_price) * 100).toFixed(0);
  // Startwert der gezeichneten Linie, also avg_price des ersten Punktes — nicht
  // dessen open_price. Nur so gilt Eröffnung + Preisveränderung = aktueller Preis;
  // open_price ist der erste Trade des Tages und weicht davon ab.
  const openPrice = history?.points?.find(p => p.avg_price != null)?.avg_price ?? null;

  useEffect(() => {
    if (!item.slug) { setHistory(null); setHistLoading(false); return; }
    let cancelled = false;
    setHistLoading(true);
    (async () => {
      try {
        const res  = await fetch(`/api/item/${encodeURIComponent(item.slug!)}/history?hours=${hours}`);
        const json = await res.json();
        if (!cancelled) setHistory(json);
      } catch { /* keep */ }
      finally { if (!cancelled) setHistLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [item.slug, hours]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Head */}
      <div style={{
        padding: "18px 24px", borderBottom: `1px solid ${C.b}`,
        background: "rgba(0,0,0,0.15)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Bild führt wie der Titel auf die Item-Seite */}
          {item.slug ? (
            <A href={itemPath(item.slug)} style={{ display: "block", cursor: "pointer", flexShrink: 0 }}
              title={`${item.item_name} — Detailseite öffnen`}>
              <ItemIcon item={item} size={52} />
            </A>
          ) : (
            <ItemIcon item={item} size={52} />
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.t, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 10 }}>
              {item.slug
                ? <A href={itemPath(item.slug)}>{item.item_name}</A>
                : <span>{item.item_name}</span>}
              {item.max_rank != null && item.max_rank > 0 && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 2, border: `1px solid rgba(200,168,75,0.4)`, color: C.gold, background: "rgba(200,168,75,0.1)", fontWeight: 700 }}>
                  R{item.max_rank}
                </span>
              )}
            </div>
            <div style={{ ...T.meta, marginTop: 6 }}>
              {new Date(item.datetime).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "monospace", color: C.gold, lineHeight: 1 }}>
            {plat(price(item))}<SmallPlatIcon />
          </div>
          <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, marginTop: 4, color: changeCol }}>
            {pct} über {HOURS_LABELS[hours]}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.b}`, flexShrink: 0 }}>
        {([
          { label: "ERÖFFNUNG",       value: <>{plat(openPrice)}<SmallPlatIcon /></>, sub: "zu Beginn des Zeitraums", color: C.t2 },
          { label: "PREISSPANNE",     value: <>{plat(item.min_price)} – {plat(item.max_price)}<SmallPlatIcon /></>, sub: <>{plat(spread)}<SmallPlatIcon /> Differenz ({spreadPct}%)</>, color: C.t },
          { label: "HANDELSVOLUMEN",  value: item.volume.toLocaleString("de-DE"), sub: "Trades im Zeitraum", color: C.cy },
          { label: "PREISVERÄNDERUNG", value: pct, sub: <>gegenüber Eröffnung ({HOURS_LABELS[hours]})</>, color: changeCol },
        ] as { label: string; value: React.ReactNode; sub: React.ReactNode; color: string }[]).map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, padding: "13px 20px", borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none" }}>
            <div style={{ ...T.label, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ ...T.meta, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart-Kopf — der Zeitraum kommt vom Seiten-Selektor, hier steht nur noch,
          worauf sich der Verlauf bezieht. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 22px", borderBottom: `1px solid ${C.b}`, gap: 10, flexWrap: "wrap", flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, letterSpacing: "0.12em", color: C.t2, fontWeight: 600 }}>
          PREISVERLAUF
        </span>
        <span style={T.meta}>
          {HOURS_LABELS[hours]} · {history?.resolution === "hour" ? "stündlich" : "täglich"}
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, padding: "12px 16px 8px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {histLoading && !history ? (
          <div style={{
            height: "100%", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.t2, fontFamily: "monospace", fontSize: 12, letterSpacing: "0.15em",
          }}>
            LADEN...
          </div>
        ) : (
          <ItemChart points={history?.points ?? []} resolution={history?.resolution ?? "day"} minHeight={260} />
        )}
      </div>
    </div>
  );
};

// ─── Farm Value Table ─────────────────────────────────────────────────────────

const FarmValueTable = () => {
  const [refinement, setRefinement] = useState("Intact");
  const [srcFilter, setSrcFilter]   = useState("Alle");
  const maxRatio = Math.max(...MOCK_FARM.map(d => d.ratio));
  const filtered = MOCK_FARM
    .filter(d => srcFilter === "Alle" ? true : srcFilter === "Relics" ? d.src_type === "relic" : d.src_type === "enemy")
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.b}`, borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        padding: "12px 18px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Farm Value Ranking (WIP)</div>
          <div style={{ ...T.meta, marginTop: 2 }}>Preis × Drop-Chance — Effizienz-Ratio</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={T.label}>REFINEMENT</span>
          {["Intact", "Flawless", "Radiant"].map(r => (
            <button key={r} onClick={() => setRefinement(r)} style={segBtn(refinement === r)}>{r}</button>
          ))}
          <div style={{ width: 1, height: 16, background: C.b, margin: "0 2px" }} />
          {["Alle", "Enemies", "Relics"].map(s => (
            <button key={s} onClick={() => setSrcFilter(s)} style={segBtn(srcFilter === s, C.cy)}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.b}` }}>
              {["#", "ITEM", "QUELLE", "PREIS", "DROP%", "RATIO (WERT×CHANCE)", "VOL"].map((h, i) => (
                <th key={h} style={{ padding: "9px 16px", fontSize: 11, letterSpacing: "0.1em", color: C.t2, fontWeight: 600, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => {
              const barW = (d.ratio / maxRatio) * 100;
              return (
                <tr key={d.name} style={{ borderTop: `1px solid ${C.b}`, transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: C.t2 }}>{i + 1}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {/* Placeholder — Farm Value wird später auf echte API-Daten umgestellt */}
                      <div style={{ width: 28, height: 28, borderRadius: 2, flexShrink: 0, background: "rgba(200,168,75,0.10)", border: `1px solid ${C.b}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                        {d.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: C.t, fontSize: 13 }}>{d.name}</div>
                        <div style={T.meta}>{d.cat}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 2, fontWeight: 700, color: d.src_type === "relic" ? C.gold : C.cy, background: d.src_type === "relic" ? "rgba(200,168,75,0.12)" : "rgba(90,180,200,0.12)", border: `1px solid ${d.src_type === "relic" ? "rgba(200,168,75,0.3)" : "rgba(90,180,200,0.3)"}` }}>
                        {d.src_type === "relic" ? "RELIC" : "ENEMY"}
                      </span>
                      <span style={{ ...T.body, fontWeight: 500 }}>{d.source}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.gold, fontWeight: 700 }}>{plat(d.price)}<SmallPlatIcon /></td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.up }}>{d.drop_pct.toFixed(2)}%</td>
                  <td style={{ padding: "10px 16px", minWidth: 180 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: C.b, borderRadius: 2, position: "relative" }}>
                        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barW}%`, borderRadius: 2, background: C.up, opacity: 0.75 }} />
                      </div>
                      <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.up, minWidth: 32, textAlign: "right" }}>{d.ratio.toFixed(2)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.t2, fontWeight: 600 }}>{d.vol}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderTop: `1px solid ${C.b}`, background: "rgba(0,0,0,0.1)", fontSize: 12, color: C.t2, fontFamily: "monospace" }}>
        <span>Mock-Daten · {filtered.length} Items · /api/market/drops wird als nächstes eingebunden</span>
        <TextLink href="#" style={{ fontSize: 12 }} onClick={e => e.preventDefault()}>Farm Value →</TextLink>
      </div>
    </div>
  );
};

// ─── DashboardPage ────────────────────────────────────────────────────────────

type ViewKey = "gainers" | "losers" | "traded" | "value";

const VIEW_CONFIG: Record<ViewKey, {
  label: string; title: string; accentColor: string; Icon: () => React.ReactElement;
}> = {
  gainers: { label: "STÄRKSTER PREISANSTIEG", title: "Stärkster Preisanstieg", accentColor: C.up,   Icon: TrendUpIcon   },
  losers:  { label: "STÄRKSTER PREISRÜCKGANG", title: "Stärkster Preisrückgang", accentColor: C.down, Icon: TrendDownIcon },
  traded:  { label: "MEISTGEHANDELT",         title: "Meistgehandelt",         accentColor: C.cy,   Icon: TradeIcon     },
  value:   { label: "TEUERSTES ITEM",         title: "Teuerstes Item",         accentColor: C.gold, Icon: ValueIcon     },
};

const VIEW_ORDER: ViewKey[] = ["gainers", "losers", "traded", "value"];

/**
 * Ansichtsumschalter im Listenkopf. Steuert denselben view-State wie die großen
 * Karten darüber — kein zweiter Zustand, beide Richtungen bleiben automatisch
 * synchron. Ersetzt die frühere Zierlinie, die keine Information trug.
 */
const ViewIconSwitch = ({
  view, onChange, loserTitle,
}: {
  view: ViewKey; onChange: (v: ViewKey) => void; loserTitle: string;
}) => (
  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
    {VIEW_ORDER.map(key => {
      const cfg    = VIEW_CONFIG[key];
      const active = view === key;
      const title  = key === "losers" ? loserTitle : cfg.title;
      return (
        <button key={key} onClick={() => onChange(key)}
          title={title} aria-label={title} aria-pressed={active}
          {...hoverSurface({ active, border: true, restBorder: "transparent" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 30, padding: 0, borderRadius: C.radBtn,
            border: `1px solid ${active ? `${cfg.accentColor}88` : "transparent"}`,
            background: active ? `${cfg.accentColor}18` : "transparent",
            color: active ? cfg.accentColor : C.t2,
            cursor: "pointer", transition: "all 0.12s",
          }}>
          <cfg.Icon />
        </button>
      );
    })}
  </div>
);

/**
 * Einheit der Veränderung. Prozent zeigt relative Bewegung, Platin die
 * tatsächliche Differenz — bei günstigen Items laufen die beiden weit
 * auseinander (+203 % sind dort keine halbe Platin). Nur bei den beiden
 * Veränderungs-Ansichten sichtbar, sonst hätte der Schalter keine Wirkung.
 */
const MetricSwitch = ({ metric, onChange }: {
  metric: ChangeMetric; onChange: (m: ChangeMetric) => void;
}) => (
  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
    {([["pct", "%", "Veränderung in Prozent"],
       ["abs", null, "Veränderung in Platin"]] as const).map(([key, label, title]) => {
      const active = metric === key;
      return (
        <button key={key} onClick={() => onChange(key)}
          title={title} aria-label={title} aria-pressed={active}
          {...segBtnHover(active)}
          style={{ ...segBtn(active), padding: 0, width: 28, height: 30, fontSize: 13, fontWeight: 700 }}>
          {label ?? <span style={{ display: "inline-flex", marginLeft: -3 }}><SmallPlatIcon /></span>}
        </button>
      );
    })}
  </div>
);

// /api/top liefert echte Verlierer inzwischen als eigene Liste (top_loser, nach
// volumengewichtetem Verlust sortiert). Nur falls die leer ist — kein einziges Item
// im Minus — fällt die Karte auf den schwächsten Anstieg zurück und benennt sich
// entsprechend, statt einen Preisrückgang zu behaupten, den es nicht gibt.
const loserLabels = (v?: number | null) =>
  (v ?? 0) < 0
    ? { label: "STÄRKSTER PREISRÜCKGANG", title: "Stärkster Preisrückgang" }
    : { label: "SCHWÄCHSTER ANSTIEG",    title: "Schwächster Anstieg"    };

export const DashboardPage = ({ data, hours, metric, onMetricChange }: DashboardPageProps) => {
  const [view, setView]               = useState<ViewKey>("gainers");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const getItems = useCallback((v: ViewKey): TopItem[] => {
    if (!data) return [];
    switch (v) {
      // Reihenfolge kommt unverändert von /api/top: dort wird nach
      // Veränderung × Glaubwürdigkeit sortiert. Eine clientseitige
      // Nachsortierung nach rohem Prozentwert hatte die Gewichtung zuvor
      // wirkungslos gemacht — ein Ausschlag mit 8 Trades stand vor einem
      // mit 42.
      case "gainers": return data.top_performer ?? [];
      // Fallback auf den schwächsten Anstieg, falls kein einziges Item im Minus
      // steht — dann heißt die Karte auch so (siehe loserLabels).
      case "losers":  return (data.top_loser ?? []).length
        ? data.top_loser
        : [...(data.top_performer ?? [])].reverse();
      case "traded":  return data.top_traded ?? [];
      case "value":   return data.top_seller ?? [];
    }
  }, [data]);

  const items = useMemo(() => getItems(view), [getItems, view]);
  const selectedItem = items[selectedIdx] ?? null;
  useEffect(() => { setSelectedIdx(0); }, [view]);

  // Karten zeigen jeweils den ersten Eintrag der GLEICH sortierten Liste,
  // damit Karte und Listenkopf nie auseinanderlaufen.
  const topGainer  = getItems("gainers")[0];
  const topLoser   = getItems("losers")[0];
  const topTraded  = (data?.top_traded ?? [])[0];
  const topValue   = (data?.top_seller ?? [])[0];

  const switchers: { key: ViewKey; value: React.ReactNode; sub: React.ReactNode; valueColor?: string }[] = [
    { key: "gainers", value: topGainer ? <ChangeValue item={topGainer} metric={metric} /> : "—", sub: topGainer ? <>{topGainer.item_name} · {plat(price(topGainer))}<SmallPlatIcon /></> : "Keine Daten", valueColor: topGainer && changeColor(topGainer, metric) === C.t2 ? C.t2 : undefined },
    { key: "losers",  value: topLoser ? <ChangeValue item={topLoser} metric={metric} /> : "—",  sub: topLoser  ? <>{topLoser.item_name} · {plat(price(topLoser))}<SmallPlatIcon /></>   : "Keine Daten", valueColor: topLoser && changeColor(topLoser, metric) === C.t2 ? C.t2 : undefined },
    { key: "traded",  value: topTraded ? topTraded.volume.toLocaleString("de-DE") : "—", sub: topTraded ? <>{topTraded.item_name} · {plat(price(topTraded))}<SmallPlatIcon /></> : "Keine Daten" },
    { key: "value",   value: topValue  ? <>{plat(price(topValue))}<SmallPlatIcon /></> : "—", sub: topValue?.item_name ?? "Keine Daten" },
  ];

  return (
    <>
      {/* Switcher cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        {switchers.map(s => {
          const cfg = s.key === "losers"
            ? { ...VIEW_CONFIG.losers, ...loserLabels(topLoser?.change_pct) }
            : VIEW_CONFIG[s.key];
          return (
            <SwitcherCard key={s.key} label={cfg.label} accentColor={cfg.accentColor}
              value={s.value} sub={s.sub} valueColor={s.valueColor} active={view === s.key} onClick={() => setView(s.key)} />
          );
        })}
      </div>

      {/* Master-Detail 38.2 / 61.8 */}
      <div style={{
        display: "flex", border: `1px solid ${C.b}`, borderRadius: 2,
        overflow: "hidden", background: C.card, backdropFilter: "blur(12px)",
        marginBottom: 22, minHeight: 520,
      }}>
        {/* List panel */}
        <div style={{ width: "38.2%", borderRight: `1px solid ${C.b}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, overflow: "hidden" }}>
              <span style={{ ...T.cardTitle, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {view === "losers"
                  ? loserLabels(topLoser?.change_pct).title
                  : VIEW_CONFIG[view].title}
              </span>
              <span style={{ ...T.meta, whiteSpace: "nowrap" }}>· {HOURS_LABELS[hours]}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {(view === "gainers" || view === "losers") && (
                <>
                  <MetricSwitch metric={metric} onChange={onMetricChange} />
                  <span style={{ width: 1, height: 18, background: C.b }} />
                </>
              )}
              <ViewIconSwitch view={view} onChange={setView}
                loserTitle={loserLabels(topLoser?.change_pct).title} />
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", ...T.meta, fontStyle: "italic" }}>Keine Daten verfügbar</div>
          ) : (
            items.map((item, i) => (
              <ListItem key={item.item_name + i} item={item} rank={i + 1} active={i === selectedIdx}
                metric={metric} showVolumeChange={view === "traded"} onClick={() => setSelectedIdx(i)} />
            ))
          )}
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedItem
            ? <DetailPanel key={selectedItem.item_name} item={selectedItem} hours={hours} metric={metric} />
            : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...T.meta, fontStyle: "italic" }}>Item auswählen</div>
          }
        </div>
      </div>

      {/* Farm Value */}
      <div style={{ fontSize: 11, letterSpacing: "0.12em", color: C.t2, fontWeight: 600, padding: "2px 0 10px" }}>FARM VALUE · WERT × DROP-CHANCE</div>
      <FarmValueTable />
    </>
  );
};