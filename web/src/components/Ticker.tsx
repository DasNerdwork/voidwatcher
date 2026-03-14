interface DisplayItem {
  item_name: string;
  datetime: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  volume: number;
}

interface TickerBannerProps {
  items: DisplayItem[];
}

// ─── Ticker Banner ─────────────────────────────────────────────────────────────
export const TickerBanner = ({ items }: TickerBannerProps) => {
  if (!items.length) return null;

  const mockChanges: Record<string, number> = {};
  items.forEach((item) => {
    const spread = item.max_price - item.min_price;
    mockChanges[item.item_name] = parseFloat(((spread / (item.avg_price || 1)) * (Math.random() > 0.4 ? 1 : -1) * 100).toFixed(1));
  });

  const allItems = [...items, ...items]; // double for seamless loop

  return (
    <div style={{
      background: "var(--bg-deep)",
      borderBottom: "1px solid var(--border)",
      borderTop: "1px solid var(--border)",
      overflow: "hidden",
      height: 36,
      display: "flex",
      alignItems: "center",
    }}>
      {/* Label */}
      <div style={{
        flexShrink: 0,
        padding: "0 16px",
        borderRight: "1px solid var(--border)",
        height: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--bg-card)",
        zIndex: 2,
      }}>
        <div className="status-dot" />
        <span style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.15em", color: "var(--plat)", fontWeight: 700 }}>
          LIVE
        </span>
      </div>

      {/* Scrolling track */}
      <div style={{ overflow: "hidden", flex: 1, position: "relative" }}>
        <div className="ticker-track">
          {allItems.map((item, idx) => {
            const chg = mockChanges[item.item_name] ?? 0;
            const up = chg >= 0;
            return (
              <div key={idx} style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                padding: "0 24px",
                borderRight: "1px solid var(--border)",
                height: 36,
                flexShrink: 0,
              }}>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {item.item_name}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--plat)", fontWeight: 700 }}>
                  {item.avg_price.toFixed(1)}p
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: up ? "var(--up)" : "var(--down)", fontWeight: 700 }}>
                  {up ? "▲" : "▼"}{Math.abs(chg).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        {/* Fade edges */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 40, background: "linear-gradient(to right, var(--bg-deep), transparent)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 40, background: "linear-gradient(to left, var(--bg-deep), transparent)", pointerEvents: "none" }} />
      </div>
    </div>
  );
};