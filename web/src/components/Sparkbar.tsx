interface SparkbarProps {
  min: number;
  avg: number;
  max: number;
}

// ─── Sparkbar Component ────────────────────────────────────────────────────────
// Theme C (Vitruvian): diamond dot, 4px bar, 12px readable numbers
export const Sparkbar = ({ min, avg, max }: SparkbarProps) => {
  if (!max || max === min) return null;
  const pct = ((avg - min) / (max - min)) * 100;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7a6e52", minWidth: 28, textAlign: "right" }}>
        {min.toFixed(0)}
      </span>

      {/* Range track */}
      <div style={{ flex: 1, position: "relative", height: 14, display: "flex", alignItems: "center" }}>
        {/* Thin line: full range */}
        <div style={{ position: "absolute", left: 0, right: 0, height: 1, background: "rgba(200,168,75,0.25)" }} />
        {/* Thick bar: 25th–75th approximation via avg position */}
        <div style={{
          position: "absolute",
          left: `${Math.max(0, pct - 15)}%`,
          width: `30%`,
          height: 5,
          background: "rgba(200,168,75,0.45)",
          borderRadius: 1,
        }} />
        {/* Avg tick */}
        <div style={{
          position: "absolute",
          left: `${pct}%`,
          transform: "translateX(-50%)",
          width: 2,
          height: 12,
          background: "#c8a84b",
          borderRadius: 1,
        }} />
      </div>

      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7a6e52", minWidth: 28 }}>
        {max.toFixed(0)}
      </span>
    </div>
  );
};