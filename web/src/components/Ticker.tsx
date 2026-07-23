import { memo } from "react";
import type { TopItem } from "../types";
import { SmallPlatIcon } from "./Icons";

interface TickerBannerProps {
  items: TopItem[];
}

// memo: verhindert Re-Render solange sich die items-Referenz nicht ändert.
// App.tsx re-rendert jede Sekunde (Uhr) — ohne memo würde der Ticker jedes
// Mal mitrendern. Der Neustart der Scroll-Animation passiert damit nur noch,
// wenn sich der Ticker-Inhalt tatsächlich ändert.
export const TickerBanner = memo(({ items }: TickerBannerProps) => {
  if (!items.length) return null;

  const allItems = [...items, ...items];

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
      {/* Label */}
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
          width: 6, height: 6, borderRadius: "50%",
          background: "#c8a84b", flexShrink: 0,
          animation: "pulse 2s ease infinite",
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#c8a84b",
          letterSpacing: "0.12em", fontFamily: "system-ui, -apple-system, sans-serif",
          whiteSpace: "nowrap",
        }}>
          SEIT SYNC
        </span>
      </div>

      {/* Scrolling track */}
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }}>
        <div className="ticker-track">
          {allItems.map((item, idx) => {
            const chg = item.change_pct ?? 0;
            const up  = chg >= 0;
            const hasChange = item.change_pct !== null;

            return (
              <div key={idx} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 18px",
                borderRight: "1px solid rgba(200,168,75,0.22)",
                height: 32,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}>
                <span style={{
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontSize: 12, fontWeight: 600, color: "#d4be8a",
                }}>
                  {item.item_name}
                </span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#c8a84b", fontWeight: 700 }}>
                  {item.avg_price.toFixed(1)}
                </span>
                <SmallPlatIcon />
                {hasChange ? (
                  <span style={{
                    fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                    color: up ? "#4dba7f" : "#d45c5c",
                  }}>
                    {up ? "▲" : "▼"}{Math.abs(chg).toFixed(1)}%
                  </span>
                ) : (
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7a6e52" }}>—</span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to right, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to left, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
      </div>
    </div>
  );
});