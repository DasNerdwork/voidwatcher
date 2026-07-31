import { memo } from "react";
import type { TopItem } from "../types";
import { SmallPlatIcon } from "./Icons";
import { A, itemPath } from "../router";
import { C, T, pctChange, plat } from "./shared";

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
      height: 36,
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
          ...T.label, color: C.gold, fontWeight: 700,
          fontFamily: "system-ui, -apple-system, sans-serif", whiteSpace: "nowrap",
        }}>
          24 H
        </span>
      </div>

      {/* Scrolling track */}
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }}>
        <div className="ticker-track">
          {allItems.map((item, idx) => {
            const chg = item.change_pct ?? 0;
            const up  = chg >= 0;
            const hasChange = item.change_pct !== null;

            // Items ohne slug (Altbestand im Cache) bleiben unverlinkt
            const wrap = (children: React.ReactNode, style: React.CSSProperties) =>
              item.slug
                ? <A key={idx} href={itemPath(item.slug)} style={style}>{children}</A>
                : <div key={idx} style={style}>{children}</div>;

            return wrap(
              <>
                <span style={{
                  ...T.bodyStrong,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}>
                  {item.item_name}
                </span>
                {/* Zahl und Icon als eine Einheit: sonst addiert sich der
                    gap: 8 der Zeile zum marginLeft: 3 des Icons auf 11px. */}
                <span style={{ ...T.num, color: C.gold, display: "inline-flex", alignItems: "center" }}>
                  {plat(item.current_price ?? item.avg_price)}
                  <SmallPlatIcon />
                </span>
                {hasChange ? (
                  <span style={{ ...T.num, color: up ? C.up : C.down }}>
                    {pctChange(chg)}
                  </span>
                ) : (
                  <span style={{ ...T.num, color: C.t2 }}>—</span>
                )}
              </>,
              {
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "0 18px",
                borderRight: "1px solid rgba(200,168,75,0.22)",
                height: 36,
                flexShrink: 0,
                whiteSpace: "nowrap",
                cursor: item.slug ? "pointer" : "default",
              },
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to right, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, background: "linear-gradient(to left, rgba(10,12,28,0.88), transparent)", pointerEvents: "none" }} />
      </div>
    </div>
  );
});