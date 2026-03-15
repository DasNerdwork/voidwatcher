import type { TopItem } from "../types";

interface StatsBarProps {
  topPerformer: TopItem[];
  topTraded: TopItem[];
}

// ─── Gold Accent Line (replaces [data-t="c"] .sc::before) ─────────────────────
const StatAccent = () => (
  <div style={{
    position: "absolute",
    top: 0, left: 0,
    width: 1, height: "100%",
    background: "#c8a84b",
    opacity: 0.4,
    pointerEvents: "none",
  }} />
);

// ─── Stats Bar ────────────────────────────────────────────────────────────────
// Theme C: rgba(8,10,26,0.6) + backdrop-filter blur — NOT the blue gradient
export const StatsBar = ({ topPerformer, topTraded }: StatsBarProps) => {
  const stats = [
    {
      label: "24H Volume",
      value: "48.290 ₱",
      meta:  "total platinum traded",
      color: "#c8a84b",
    },
    {
      label: "Active Listings",
      value: "12.447",
      meta:  "↑ 8.2% vs yesterday",
      color: "#e8dfc0",
    },
    {
      label: "Top Gainer",
      value: topPerformer[0]?.item_name ?? "—",
      meta:  topPerformer[0] ? `↑ · ${topPerformer[0].avg_price.toFixed(0)}₱ avg` : "—",
      color: "#4dba7f",
    },
    {
      label: "Most Traded",
      value: topTraded[0]?.item_name ?? "—",
      meta:  topTraded[0] ? `${topTraded[0].volume.toLocaleString("de-DE")} Trades` : "—",
      color: "#5ab4c8",
    },
  ];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      borderBottom:        "1px solid rgba(200,168,75,0.22)",
      // Theme C: dark translucent — not the blue gradient from Theme B
      background:          "rgba(8,10,26,0.6)",
      backdropFilter:      "blur(10px)",
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding:     "18px 22px",
          borderRight: i < stats.length - 1 ? "1px solid rgba(200,168,75,0.22)" : "none",
          position:    "relative",
        }}>
          <StatAccent />
          <div style={{
            fontSize:      11,
            color:         "#7a6e52",
            marginBottom:  6,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily:    "system-ui, -apple-system, sans-serif",
          }}>
            {s.label}
          </div>
          <div style={{
            fontSize:          24,
            fontWeight:        500,
            lineHeight:        1,
            color:             s.color,
            fontVariantNumeric: "tabular-nums",
            fontFamily:        "system-ui, -apple-system, sans-serif",
            overflow:          "hidden",
            textOverflow:      "ellipsis",
            whiteSpace:        "nowrap",
          }}>
            {s.value}
          </div>
          <div style={{
            fontSize:   12,
            color:      "#b8a97c",
            marginTop:  5,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>
            {s.meta}
          </div>
        </div>
      ))}
    </div>
  );
};