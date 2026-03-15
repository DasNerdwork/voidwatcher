import { useState } from "react";
import { SmallPlatIcon } from "./Icons";
import { Sparkbar } from "./Sparkbar";
import type { TopItem } from "../types";

interface MarketTableProps {
  title:       string;
  subtitle:    string;
  rows:        TopItem[];
  hours:       number;
  accentColor: string;
}

// ─── Shared Design Tokens ─────────────────────────────────────────────────────
const C = {
  card: "rgba(10,12,32,0.82)",
  hov:  "rgba(200,168,75,0.07)",
  b:    "rgba(200,168,75,0.22)",
  t:    "#e8dfc0",
  t2:   "#b8a97c",
  t3:   "#7a6e52",
  gold: "#c8a84b",
} as const;

// ─── Vitruvian helpers (local copies — keep App.tsx clean) ────────────────────
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

// ─── MarketTable ──────────────────────────────────────────────────────────────
export const MarketTable = ({ title, subtitle, rows, hours, accentColor }: MarketTableProps) => {
  const [sortKey, setSortKey] = useState<"avg_price" | "volume" | "spread">("avg_price");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const hoursLabel = () =>
    ({ 24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T" } as Record<number, string>)[hours] ?? `${hours}H`;

  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "avg_price") return (a.avg_price - b.avg_price) * sortDir;
    if (sortKey === "volume")    return (a.volume    - b.volume)    * sortDir;
    if (sortKey === "spread")    return ((a.max_price - a.min_price) - (b.max_price - b.min_price)) * sortDir;
    return 0;
  });

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(-1); }
  };

  const SortBtn = ({ col, label }: { col: typeof sortKey; label: string }) => (
    <button onClick={() => toggleSort(col)} style={{
      background: "none", border: "none", cursor: "pointer", fontSize: 9,
      letterSpacing: "0.15em", color: sortKey === col ? accentColor : C.t3,
      display: "flex", alignItems: "center", gap: 4, padding: 0, fontWeight: 600,
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {label}
      <span style={{ fontSize: 8, opacity: sortKey === col ? 1 : 0.3 }}>
        {sortKey === col ? (sortDir === -1 ? "▼" : "▲") : "▼"}
      </span>
    </button>
  );

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.b}`, borderRadius: "2px",
      overflow: "hidden", position: "relative", backdropFilter: "blur(10px)",
    }}>
      <CardCorner />

      {/* Header */}
      <div style={{
        padding: "13px 18px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.18)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 1, height: 15, background: accentColor, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>{title.toUpperCase()}</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 1 }}>{subtitle}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <VitFlourish />
          <span style={{
            fontSize: 11, letterSpacing: "0.15em", color: accentColor,
            background: `${accentColor}18`, padding: "2px 8px",
            borderRadius: "2px", border: `1px solid ${accentColor}44`,
          }}>
            {hoursLabel()}
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.b}` }}>
              <th style={{ padding: "9px 15px", textAlign: "left", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 11, color: C.t3 }}>
                Item
              </th>
              <th style={{ padding: "9px 15px", textAlign: "right" }}>
                <SortBtn col="avg_price" label="PREIS" />
              </th>
              <th style={{ padding: "9px 15px", textAlign: "center", minWidth: 160 }}>
                <span style={{ fontSize: 9, letterSpacing: "0.15em", color: C.t3, fontWeight: 600 }}>RANGE</span>
              </th>
              <th style={{ padding: "9px 15px", textAlign: "right" }}>
                <SortBtn col="volume" label="VOL" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", padding: "32px 16px", color: C.t3, fontSize: 13, fontStyle: "italic" }}>
                  Keine Daten verfügbar
                </td>
              </tr>
            ) : sorted.map((item, idx) => (
              <tr key={idx}
                style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.08s" }}
                onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "10px 15px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: C.t3, minWidth: 16, textAlign: "right" }}>
                      {idx + 1}
                    </span>
                    <div style={{ fontWeight: 600, color: C.t, fontSize: 13, lineHeight: 1.5 }}>
                      {item.item_name}
                    </div>
                  </div>
                </td>
                <td style={{ padding: "10px 15px", textAlign: "right", verticalAlign: "middle" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 15, color: C.gold, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                    <SmallPlatIcon />{item.avg_price.toFixed(1)}
                  </div>
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <Sparkbar min={item.min_price} avg={item.avg_price} max={item.max_price} />
                </td>
                <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.t2, verticalAlign: "middle" }}>
                  {item.volume.toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};