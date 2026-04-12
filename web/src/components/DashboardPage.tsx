import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { SmallPlatIcon } from "./Icons";
import { C, segBtn } from "./shared";
import type { TopItem } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
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

interface DashboardPageProps {
  data:  ApiResponse | null;
  hours: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURS_LABELS: Record<number, string> = {
  24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T",
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

// ─── Sparkline ────────────────────────────────────────────────────────────────

const Sparkline = ({ data, up, w = 44, h = 22 }: { data: number[]; up: boolean; w?: number; h?: number }) => {
  const pad = 2;
  const mn = Math.min(...data), mx = Math.max(...data);
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - mn) / (mx - mn || 1)) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? C.up : C.down} strokeWidth="1.5" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
};

// ─── Price Chart ──────────────────────────────────────────────────────────────

const PriceChart = ({ data, up, lastSyncIdx }: { data: number[]; up: boolean; lastSyncIdx: number }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 200 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w: W, h: H } = size;
  const pad = { t: 10, r: 46, b: 28, l: 6 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const mn = Math.min(...data), mx = Math.max(...data);
  const range = mx - mn || 1;
  const toX = (i: number) => pad.l + (i / (data.length - 1)) * iw;
  const toY = (v: number) => pad.t + (1 - (v - mn) / range) * ih;
  const pts = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaPath = [`M${toX(0)},${toY(data[0])}`, ...data.map((v, i) => `L${toX(i).toFixed(1)},${toY(v).toFixed(1)}`), `L${toX(data.length-1)},${H-pad.b}`, `L${toX(0)},${H-pad.b} Z`].join(" ");
  const col = up ? C.up : C.down;
  const syncX = toX(lastSyncIdx);
  const yTicks = [mn, mn + range * 0.5, mx].map(v => ({ y: toY(v), label: v.toFixed(0) }));
  const xTicks: { x: number; label: string }[] = [];
  data.forEach((_, i) => { const h = data.length - 1 - i; if (h % 6 === 0) xTicks.push({ x: toX(i), label: h === 0 ? "jetzt" : `-${h}h` }); });

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
      <svg width={W} height={H} style={{ display: "block", overflow: "hidden" }}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.18" />
            <stop offset="100%" stopColor={col} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {yTicks.map(({ y }, i) => <line key={i} x1={pad.l} y1={y} x2={W-pad.r} y2={y} stroke={C.b} strokeWidth="0.5" />)}
        <path d={areaPath} fill="url(#chartGrad)" />
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" />
        <line x1={syncX} y1={pad.t} x2={syncX} y2={H-pad.b} stroke={C.gold} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
        <text x={syncX+3} y={pad.t+10} fontSize="10" fill={C.gold} opacity="0.9" fontFamily="monospace">sync</text>
        <circle cx={toX(data.length-1)} cy={toY(data[data.length-1])} r="3" fill={col} />
        {yTicks.map(({ y, label: l }) => <text key={l} x={W-pad.r+4} y={y+4} fontSize="10" fill={C.t3} fontFamily="monospace">{l} Plat</text>)}
        {xTicks.map(({ x, label: l }) => <text key={l} x={x} y={H-6} fontSize="10" fill={C.t3} fontFamily="monospace" textAnchor="middle">{l}</text>)}
      </svg>
    </div>
  );
};

// ─── Mock price generator ─────────────────────────────────────────────────────

function mockPrices(base: number, up: boolean, n = 24): number[] {
  const prices: number[] = [base * (up ? 0.82 : 1.12)];
  for (let i = 1; i < n; i++) {
    const drift = up ? 0.008 : -0.008;
    const noise = (Math.random() - 0.48) * 0.03;
    prices.push(Math.max(1, prices[i - 1] * (1 + drift + noise)));
  }
  return prices;
}

// ─── Switcher Card ────────────────────────────────────────────────────────────

const SwitcherCard = ({
  label, value, sub, accentColor, active, onClick,
}: {
  label: string; value: React.ReactNode; sub: React.ReactNode;
  accentColor: string; active: boolean; onClick: () => void;
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
    <div style={{ fontSize: 10, letterSpacing: "0.14em", color: C.t3, fontWeight: 600, marginBottom: 7 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: accentColor, lineHeight: 1.1, marginBottom: 4 }}>{value}</div>
    <div style={{ fontSize: 11, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
  </button>
);

// ─── List Item ────────────────────────────────────────────────────────────────

const ListItem = ({ item, rank, active, onClick }: { item: TopItem; rank: number; active: boolean; onClick: () => void }) => {
  const up = (item.change_pct ?? 0) >= 0;
  const pct = item.change_pct != null ? `${up ? "+" : ""}${item.change_pct.toFixed(1)}%` : "—";
  const mockPx = useMemo(() => mockPrices(item.avg_price, up), [item.avg_price, up]);

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
      <span style={{ fontFamily: "monospace", fontSize: 11, color: C.t3, minWidth: 16, fontWeight: 600 }}>{rank}</span>
      <ItemIcon item={item} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: active ? C.gold : C.t, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.item_name}
        </div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
          {item.max_rank != null && item.max_rank > 0 ? `R${item.max_rank} · ` : ""}Vol {item.volume}
        </div>
      </div>
      <Sparkline data={mockPx.slice(-8)} up={up} />
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: C.gold, fontWeight: 700 }}>
          {item.avg_price.toFixed(1)}<SmallPlatIcon />
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, marginTop: 2, color: up ? C.up : C.down }}>{pct}</div>
      </div>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const PRESETS = ["Seit Sync", "24H", "48H", "7T", "14T", "30T", "90T"];

const DetailPanel = ({ item }: { item: TopItem }) => {
  const [preset, setPreset] = useState("Seit Sync");
  const up = (item.change_pct ?? 0) >= 0;
  const pct = item.change_pct != null ? `${up ? "+" : ""}${item.change_pct.toFixed(1)}%` : "—";
  const spread = item.max_price - item.min_price;
  const spreadPct = ((spread / item.avg_price) * 100).toFixed(0);
  const mockPx = useMemo(() => mockPrices(item.avg_price, up, 24), [item.avg_price, up]);
  const LAST_SYNC_IDX = 20;

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
          {/* Full-size image in detail view */}
          <ItemIcon item={item} size={52} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.t, lineHeight: 1.2, display: "flex", alignItems: "center", gap: 10 }}>
              <span>{item.item_name}</span>
              {item.max_rank != null && item.max_rank > 0 && (
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 2, border: `1px solid rgba(200,168,75,0.4)`, color: C.gold, background: "rgba(200,168,75,0.1)", fontWeight: 700 }}>
                  R{item.max_rank}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 5 }}>
              {new Date(item.datetime).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "monospace", color: C.gold, lineHeight: 1 }}>
            {item.avg_price.toFixed(1)}<SmallPlatIcon />
          </div>
          <div style={{ fontSize: 14, fontFamily: "monospace", fontWeight: 700, marginTop: 4, color: up ? C.up : C.down }}>
            {pct} seit Sync
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.b}`, flexShrink: 0 }}>
        {([
          { label: "ERÖFFNUNG", value: <>{item.min_price.toFixed(1)}<SmallPlatIcon /></>, sub: "vor letztem Sync",    color: C.t2 },
          { label: "RANGE",     value: <>{item.min_price.toFixed(0)} – {item.max_price.toFixed(0)}<SmallPlatIcon /></>, sub: <>{spread.toFixed(0)}<SmallPlatIcon /> Spread ({spreadPct}%)</>, color: C.t },
          { label: "VOLUMEN",   value: item.volume.toLocaleString("de-DE"), sub: "Trades im Zeitraum", color: C.cy },
          { label: "CHANGE",    value: pct, sub: "seit letztem Sync", color: up ? C.up : C.down },
        ] as { label: string; value: React.ReactNode; sub: React.ReactNode; color: string }[]).map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, padding: "13px 20px", borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: C.t3, fontWeight: 600, marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart controls */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 22px", borderBottom: `1px solid ${C.b}`, gap: 10, flexWrap: "wrap", flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, letterSpacing: "0.16em", color: C.t3, fontWeight: 600 }}>
          PREISVERLAUF
          <span style={{ fontStyle: "italic", letterSpacing: "0.04em", marginLeft: 6, opacity: 0.6 }}>(Mock · Zeitreihen-Endpoint folgt)</span>
        </span>
        <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
          {PRESETS.map(p => (
            <button key={p} onClick={() => setPreset(p)} style={{
              ...segBtn(preset === p), fontSize: 11,
              ...(p === "Seit Sync" && preset !== p ? { borderColor: `${C.gold}55`, color: C.gold } : {}),
            }}>
              {p === "Seit Sync" ? "⟳ " + p : p}
            </button>
          ))}
          <div style={{ width: 1, height: 16, background: C.b, margin: "0 4px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.t3 }}>
            <input type="date" defaultValue="2026-02-18" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${C.b}`, borderRadius: 2, color: C.t2, fontSize: 11, padding: "3px 8px", outline: "none", fontFamily: "monospace", cursor: "pointer" }} />
            <span>—</span>
            <input type="date" defaultValue="2026-03-19" style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${C.b}`, borderRadius: 2, color: C.t2, fontSize: 11, padding: "3px 8px", outline: "none", fontFamily: "monospace", cursor: "pointer" }} />
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, padding: "12px 16px 8px", boxSizing: "border-box" }}>
        <PriceChart data={mockPx} up={up} lastSyncIdx={LAST_SYNC_IDX} />
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
          <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>Preis × Drop-Chance — Effizienz-Ratio</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, letterSpacing: "0.12em", color: C.t3, fontWeight: 600 }}>REFINEMENT</span>
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
                <th key={h} style={{ padding: "9px 16px", fontSize: 10, letterSpacing: "0.1em", color: C.t3, fontWeight: 600, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
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
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", fontSize: 11, color: C.t3 }}>{i + 1}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      {/* Placeholder — Farm Value wird später auf echte API-Daten umgestellt */}
                      <div style={{ width: 28, height: 28, borderRadius: 2, flexShrink: 0, background: "rgba(200,168,75,0.10)", border: `1px solid ${C.b}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                        {d.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: C.t, fontSize: 13 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: C.t3 }}>{d.cat}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 2, fontWeight: 700, color: d.src_type === "relic" ? C.gold : C.cy, background: d.src_type === "relic" ? "rgba(200,168,75,0.12)" : "rgba(90,180,200,0.12)", border: `1px solid ${d.src_type === "relic" ? "rgba(200,168,75,0.3)" : "rgba(90,180,200,0.3)"}` }}>
                        {d.src_type === "relic" ? "RELIC" : "ENEMY"}
                      </span>
                      <span style={{ fontSize: 12, color: C.t2, fontWeight: 500 }}>{d.source}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.gold, fontWeight: 700 }}>{d.price}<SmallPlatIcon /></td>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", borderTop: `1px solid ${C.b}`, background: "rgba(0,0,0,0.1)", fontSize: 11, color: C.t3, fontFamily: "monospace" }}>
        <span>Mock-Daten · {filtered.length} Items · /api/market/drops wird als nächstes eingebunden</span>
        <a href="#" style={{ color: C.t3, textDecoration: "none", fontSize: 11 }} onClick={e => e.preventDefault()}>Farm Value →</a>
      </div>
    </div>
  );
};

// ─── DashboardPage ────────────────────────────────────────────────────────────

type ViewKey = "gainers" | "losers" | "traded" | "value";

const VIEW_CONFIG: Record<ViewKey, { label: string; accentColor: string }> = {
  gainers: { label: "GRÖSSTER GAINER",    accentColor: C.up   },
  losers:  { label: "GRÖSSTER VERLIERER", accentColor: C.down },
  traded:  { label: "MEISTGEHANDELT",     accentColor: C.cy   },
  value:   { label: "HÖCHSTER WERT",      accentColor: C.gold },
};

export const DashboardPage = ({ data, hours }: DashboardPageProps) => {
  const [view, setView]               = useState<ViewKey>("gainers");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const getItems = useCallback((v: ViewKey): TopItem[] => {
    if (!data) return [];
    switch (v) {
      case "gainers": return [...(data.top_performer ?? [])].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0));
      case "losers":  return [...(data.top_performer ?? [])].sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0));
      case "traded":  return data.top_traded ?? [];
      case "value":   return data.top_seller ?? [];
    }
  }, [data]);

  const items = useMemo(() => getItems(view), [getItems, view]);
  const selectedItem = items[selectedIdx] ?? null;
  useEffect(() => { setSelectedIdx(0); }, [view]);

  const gainers    = data?.top_performer ?? [];
  const topGainer  = [...gainers].sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))[0];
  const topLoser   = [...gainers].sort((a, b) => (a.change_pct ?? 0) - (b.change_pct ?? 0))[0];
  const topTraded  = (data?.top_traded ?? [])[0];
  const topValue   = (data?.top_seller ?? [])[0];

  const switchers: { key: ViewKey; value: React.ReactNode; sub: React.ReactNode }[] = [
    { key: "gainers", value: topGainer  ? `+${topGainer.change_pct?.toFixed(1)}%` : "—", sub: topGainer  ? <>{topGainer.item_name} · {topGainer.avg_price.toFixed(1)}<SmallPlatIcon /></>  : "Keine Daten" },
    { key: "losers",  value: topLoser?.change_pct != null ? `${topLoser.change_pct.toFixed(1)}%` : "—", sub: topLoser   ? <>{topLoser.item_name} · {topLoser.avg_price.toFixed(1)}<SmallPlatIcon /></>    : "Keine Daten" },
    { key: "traded",  value: topTraded  ? topTraded.volume.toLocaleString("de-DE") : "—", sub: topTraded  ? <>{topTraded.item_name} · {topTraded.avg_price.toFixed(1)}<SmallPlatIcon /></>  : "Keine Daten" },
    { key: "value",   value: topValue   ? <>{topValue.avg_price.toFixed(0)}<SmallPlatIcon /></> : "—", sub: topValue?.item_name ?? "Keine Daten" },
  ];

  return (
    <>
      {/* Switcher cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        {switchers.map(s => (
          <SwitcherCard key={s.key} {...VIEW_CONFIG[s.key]} value={s.value} sub={s.sub} active={view === s.key} onClick={() => setView(s.key)} />
        ))}
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>
                {VIEW_CONFIG[view].label.charAt(0) + VIEW_CONFIG[view].label.slice(1).toLowerCase().replace("Ö", "ö").replace("Ä", "ä")}
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{HOURS_LABELS[hours]}</div>
            </div>
            <svg style={{ opacity: 0.45, flexShrink: 0 }} width="50" height="9" viewBox="0 0 60 10">
              <path d="M0 5 Q7.5 1 15 5 Q22.5 9 30 5 Q37.5 1 45 5 Q52.5 9 60 5" stroke="#c8a84b" strokeWidth="0.9" fill="none" />
            </svg>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontSize: 12, fontStyle: "italic" }}>Keine Daten verfügbar</div>
          ) : (
            items.map((item, i) => (
              <ListItem key={item.item_name + i} item={item} rank={i + 1} active={i === selectedIdx} onClick={() => setSelectedIdx(i)} />
            ))
          )}
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedItem
            ? <DetailPanel key={selectedItem.item_name} item={selectedItem} />
            : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.t3, fontSize: 13, fontStyle: "italic" }}>Item auswählen</div>
          }
        </div>
      </div>

      {/* Farm Value */}
      <div style={{ fontSize: 10, letterSpacing: "0.18em", color: C.t3, fontWeight: 600, padding: "2px 0 10px" }}>FARM VALUE · WERT × DROP-CHANCE</div>
      <FarmValueTable />
    </>
  );
};