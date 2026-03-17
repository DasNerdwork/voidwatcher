import type { TopItem } from "../types";
import { SmallPlatIcon } from "./Icons";

interface TickerBannerProps {
  items: TopItem[];
}

// ─── Ticker Banner ─────────────────────────────────────────────────────────────
export const TickerBanner = ({ items }: TickerBannerProps) => {
  if (!items.length) return null;

  const allItems = [...items, ...items]; // doubled for seamless loop

  return (
    <div style={{
      height: 32,
      background: "rgba(10,12,28,0.88)",
      borderBottom: "1px solid rgba(200,168,75,0.22)",
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
      backdropFilter: "blur(14px)",
    }}>
      {/* LIVE label */}
      <div style={{
        flexShrink: 0,
        padding: "0 14px",
        borderRight: "1px solid rgba(200,168,75,0.38)",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: "rgba(200,168,75,0.07)",
      }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#860dc7",
          flexShrink: 0,
          animation: "pulse 2s ease infinite",
        }} />
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#c8a84b",
          letterSpacing: "0.12em",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          LAST 24H
        </span>
      </div>

      {/* Scrolling track */}
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }}>
        <div className="ticker-track">
          {allItems.map((item, idx) => {
            // chg comes from the API — null means no prior window available
            const chg = item.change_pct ?? 0;
            const up  = chg >= 0;
            const hasChange = item.change_pct !== null;

            return (
              <div key={idx} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                padding: "0 20px",
                borderRight: "1px solid rgba(200,168,75,0.22)",
                height: 32,
                flexShrink: 0,
              }}>
                <span style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#b8a97c",
                  whiteSpace: "nowrap",
                }}>
                  {item.item_name}
                </span>
                {item.avg_price.toFixed(1)}<SmallPlatIcon />
                {hasChange ? (
                  <span style={{
                    fontFamily: "monospace",
                    fontSize: 11,
                    fontWeight: 700,
                    color: up ? "#4dba7f" : "#d45c5c",
                  }}>
                    {up ? "▲" : "▼"}{Math.abs(chg).toFixed(1)}%
                  </span>
                ) : (
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7a6e52" }}>
                    —
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 32, background: "linear-gradient(to right, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 32, background: "linear-gradient(to left, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
      </div>
    </div>
  );
};