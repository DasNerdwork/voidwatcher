import { useState, useMemo } from "react";
import { SmallPlatIcon } from "./Icons";
import { Sparkbar } from "./Sparkbar";
import type { TopItem } from "../types";

interface MarketTableProps {
  title:       string;
  subtitle:    string;
  rows:        TopItem[];
  hours:       number;
  accentColor: string;
  pageSize?:   number;
}

const C = {
  card: "rgba(10,12,32,0.82)",
  hov:  "rgba(200,168,75,0.07)",
  b:    "rgba(200,168,75,0.22)",
  t:    "#e8dfc0",
  t2:   "#b8a97c",
  t3:   "#7a6e52",
  gold: "#c8a84b",
  up:   "#4dba7f",
  down: "#d45c5c",
} as const;

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

export const MarketTable = ({ title, subtitle, rows, hours, accentColor, pageSize = 15 }: MarketTableProps) => {
  const [sortKey, setSortKey] = useState<"avg_price" | "volume" | "spread" | "change_pct">("avg_price");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(0);

  const hoursLabel = () =>
    ({ 24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T" } as Record<number, string>)[hours] ?? `${hours}H`;

  const filtered = useMemo(() =>
    search.trim()
      ? rows.filter(r => r.item_name?.toLowerCase().includes(search.toLowerCase()))
      : rows,
    [rows, search]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === "avg_price")  return (a.avg_price - b.avg_price) * sortDir;
    if (sortKey === "volume")     return (a.volume    - b.volume)    * sortDir;
    if (sortKey === "change_pct") return ((a.change_pct ?? 0) - (b.change_pct ?? 0)) * sortDir;
    if (sortKey === "spread")     return ((a.max_price - a.min_price) - (b.max_price - b.min_price)) * sortDir;
    return 0;
  }), [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated  = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1);
    else { setSortKey(key); setSortDir(-1); }
    setPage(0);
  };

  const onSearch = (v: string) => { setSearch(v); setPage(0); };

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

      {/* Search bar */}
      <div style={{ padding: "8px 15px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.10)" }}>
        <div style={{ position: "relative" }}>
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none"
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: C.t3, pointerEvents: "none" }}>
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Filter items..."
            style={{
              width: "100%", background: "rgba(0,0,0,0.25)", border: `1px solid ${C.b}`,
              borderRadius: "2px", padding: "5px 10px 5px 26px", color: C.t,
              fontSize: 12, outline: "none", transition: "border-color 0.15s",
              fontFamily: "system-ui, -apple-system, sans-serif",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.gold)}
            onBlur={e  => (e.currentTarget.style.borderColor = C.b)}
          />
          {search && (
            <button onClick={() => onSearch("")} style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: C.t3, cursor: "pointer",
              fontSize: 14, lineHeight: 1, padding: 0,
            }}>×</button>
          )}
        </div>
        {search && (
          <div style={{ fontSize: 10, color: C.t3, marginTop: 4, letterSpacing: "0.08em" }}>
            {filtered.length} von {rows.length} Items
          </div>
        )}
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
              <th style={{ padding: "9px 15px", textAlign: "center", minWidth: 150 }}>
                <span style={{ fontSize: 9, letterSpacing: "0.15em", color: C.t3, fontWeight: 600 }}>RANGE</span>
              </th>
              <th style={{ padding: "9px 15px", textAlign: "right" }}>
                <SortBtn col="change_pct" label="CHANGE" />
              </th>
              <th style={{ padding: "9px 15px", textAlign: "right" }}>
                <SortBtn col="volume" label="VOL" />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: C.t3, fontSize: 13, fontStyle: "italic" }}>
                  {search ? `Keine Items für "${search}"` : "Keine Daten verfügbar"}
                </td>
              </tr>
            ) : paginated.map((item, idx) => {
              const globalIdx = page * pageSize + idx + 1;
              const cp = item.change_pct;
              const cpColor = cp == null ? C.t3 : cp > 0 ? C.up : cp < 0 ? C.down : C.t3;

              return (
                <tr key={idx}
                  style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.08s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 15px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: C.t3, minWidth: 22, textAlign: "right" }}>
                        {globalIdx}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: C.t, fontSize: 13, lineHeight: 1.5 }}>
                          {item.item_name}
                        </span>
                        {item.max_rank != null && item.max_rank > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "1px 4px",
                            borderRadius: "2px", background: `${C.gold}22`,
                            border: `1px solid ${C.gold}55`, color: C.gold,
                            letterSpacing: "0.08em", flexShrink: 0,
                          }}>
                            R{item.max_rank}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td style={{ padding: "10px 15px", textAlign: "right", verticalAlign: "middle" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 15, color: C.gold, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                      {item.avg_price.toFixed(1)}<SmallPlatIcon />
                    </div>
                  </td>

                  <td style={{ padding: "8px 12px", minWidth: 150 }}>
                    <Sparkbar min={item.min_price} avg={item.avg_price} max={item.max_price} />
                  </td>

                  <td style={{ padding: "10px 15px", textAlign: "right", verticalAlign: "middle" }}>
                    {cp != null ? (
                      <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: cpColor }}>
                        {cp > 0 ? "+" : ""}{cp.toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: C.t3, fontSize: 11 }}>—</span>
                    )}
                  </td>

                  <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.t2, verticalAlign: "middle" }}>
                    {item.volume.toLocaleString("de-DE")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 15px", borderTop: `1px solid ${C.b}`, background: "rgba(0,0,0,0.10)",
        }}>
          <span style={{ fontSize: 11, color: C.t3, fontFamily: "monospace" }}>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} / {sorted.length}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{
                padding: "3px 10px", borderRadius: "2px", fontSize: 11,
                border: `1px solid ${C.b}`, background: "transparent",
                color: page === 0 ? C.t3 : C.t2, cursor: page === 0 ? "default" : "pointer",
                opacity: page === 0 ? 0.4 : 1,
              }}
            >←</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const startPage = Math.min(Math.max(page - 2, 0), Math.max(totalPages - 5, 0));
              const p = startPage + i;
              return (
                <button key={p} onClick={() => setPage(p)} style={{
                  padding: "3px 8px", borderRadius: "2px", fontSize: 11,
                  border: page === p ? `1px solid ${accentColor}88` : `1px solid ${C.b}`,
                  background: page === p ? `${accentColor}18` : "transparent",
                  color: page === p ? accentColor : C.t3, cursor: "pointer",
                }}>
                  {p + 1}
                </button>
              );
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              style={{
                padding: "3px 10px", borderRadius: "2px", fontSize: 11,
                border: `1px solid ${C.b}`, background: "transparent",
                color: page === totalPages - 1 ? C.t3 : C.t2,
                cursor: page === totalPages - 1 ? "default" : "pointer",
                opacity: page === totalPages - 1 ? 0.4 : 1,
              }}
            >→</button>
          </div>
        </div>
      )}
    </div>
  );
};