import React from "react";

interface SparkbarProps {
  min: number;
  avg: number;
  max: number;
}

// ─── Sparkbar Component ────────────────────────────────────────────────────────
export const Sparkbar = ({ min, avg, max }: SparkbarProps) => {
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