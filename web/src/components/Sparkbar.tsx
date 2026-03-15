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
      {/* Min label */}
      <span style={{
        fontFamily: "monospace",
        fontSize: 12,
        color: "#b8a97c",
        minWidth: 30,
        textAlign: "right",
        fontWeight: 500,
        lineHeight: 1,
      }}>
        {min.toFixed(0)}
      </span>

      {/* Bar track */}
      <div style={{
        flex: 1,
        height: 4,
        background: "rgba(200,168,75,0.22)",
        borderRadius: 1,
        position: "relative",
      }}>
        {/* Fill */}
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${pct}%`,
          background: "#c8a84b",
          borderRadius: 1,
          opacity: 0.7,
        }} />
        {/* Diamond indicator dot — Theme C specific */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${pct}%`,
          width: 8,
          height: 8,
          background: "#c8a84b",
          borderRadius: 0,
          transform: "translate(-50%, -50%) rotate(45deg)",
        }} />
      </div>

      {/* Max label */}
      <span style={{
        fontFamily: "monospace",
        fontSize: 12,
        color: "#b8a97c",
        minWidth: 30,
        textAlign: "left",
        fontWeight: 500,
        lineHeight: 1,
      }}>
        {max.toFixed(0)}
      </span>
    </div>
  );
};