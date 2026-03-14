import React, { useState } from "react";
import { SmallPlatIcon } from "../components/Icons";

interface DisplayItem {
  item_name: string;
  datetime: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  volume: number;
}

interface Props {
  title: string;
  subtitle?: string;
  rows: DisplayItem[];
  hours: number;
  accentColor?: string;
}


const Sparkbar = ({ min, avg, max }: { min: number; avg: number; max: number }) => {
  if (!max || max === min) return null;
  const pct = ((avg - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", minWidth: 24 }}>{min.toFixed(0)}</span>
      <div style={{ flex: 1, height: 3, background: "var(--border)", borderRadius: 2, position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${pct}%`, background: "var(--plat)", borderRadius: 2,
          boxShadow: "0 0 4px var(--plat)",
        }} />
        <div style={{
          position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
          left: `${pct}%`, width: 5, height: 5, borderRadius: "50%",
          background: "var(--plat)", boxShadow: "0 0 6px var(--plat)",
        }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", minWidth: 24, textAlign: "right" }}>{max.toFixed(0)}</span>
    </div>
  );
};

const Table: React.FC<Props> = ({ title, subtitle, rows, hours, accentColor = "var(--plat)" }) => {
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
            {subtitle && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
                {subtitle}
              </div>
            )}
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

export default Table;