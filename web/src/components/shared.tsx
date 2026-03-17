import type React from "react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
export const C = {
  card:   "rgba(10,12,32,0.82)",
  hov:    "rgba(200,168,75,0.07)",
  b:      "rgba(200,168,75,0.22)",
  b2:     "rgba(200,168,75,0.38)",
  t:      "#e8dfc0",
  t2:     "#b8a97c",
  t3:     "#7a6e52",
  gold:   "#c8a84b",
  up:     "#4dba7f",
  down:   "#d45c5c",
  cy:     "#5ab4c8",
  rad:    "2px",
  radBtn: "2px",
} as const;

// ─── Tag options ──────────────────────────────────────────────────────────────
export const TAG_OPTIONS: { label: string; value: string | null }[] = [
  { label: "Alle",       value: null },
  { label: "Mods",       value: "mod" },
  { label: "Prime",      value: "prime" },
  { label: "Relics",     value: "relic" },
  { label: "Waffen",     value: "weapon" },
  { label: "Warframes",  value: "warframe" },
  { label: "Arcanes",    value: "arcane" },
  { label: "Ressourcen", value: "resource" },
];

// ─── Shared small button style ────────────────────────────────────────────────
export const segBtn = (active: boolean, color: string = C.gold): React.CSSProperties => ({
  padding: "4px 11px",
  border: active ? `1px solid ${color}88` : `1px solid ${C.b}`,
  borderRadius: C.radBtn,
  background: active ? `${color}14` : "transparent",
  color: active ? color : C.t3,
  fontSize: 10, fontWeight: active ? 700 : 400,
  letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.12s",
});

// ─── CardCorner ───────────────────────────────────────────────────────────────
export const CardCorner = () => (
  <svg width="14" height="14" viewBox="0 0 14 14"
    style={{ position: "absolute", top: 6, right: 6, pointerEvents: "none" }}>
    <line x1="0" y1="7" x2="14" y2="7" stroke="#c8a84b" strokeWidth="0.7" opacity="0.5" />
    <line x1="7" y1="0" x2="7" y2="14" stroke="#c8a84b" strokeWidth="0.7" opacity="0.5" />
  </svg>
);

// ─── VitFlourish ──────────────────────────────────────────────────────────────
export const VitFlourish = () => (
  <svg width="60" height="10" viewBox="0 0 60 10" style={{ opacity: 0.55, flexShrink: 0 }}>
    <path d="M0 5 Q7.5 1 15 5 Q22.5 9 30 5 Q37.5 1 45 5 Q52.5 9 60 5"
      stroke="#c8a84b" strokeWidth="0.9" fill="none" />
  </svg>
);

// ─── TagFilter ────────────────────────────────────────────────────────────────
interface TagFilterProps {
  activeTag: string | null;
  onChange:  (tag: string | null) => void;
}

export const TagFilter = ({ activeTag, onChange }: TagFilterProps) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
    <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.18em", marginRight: 4 }}>KATEGORIE</span>
    {TAG_OPTIONS.map(({ label, value }) => {
      const active = activeTag === value;
      return (
        <button
          key={label}
          onClick={() => onChange(value)}
          style={{
            padding: "4px 11px",
            border: active ? `1px solid ${C.b2}` : `1px solid ${C.b}`,
            borderRadius: C.radBtn,
            background: active ? C.hov : "transparent",
            color: active ? C.gold : C.t3,
            fontSize: 10, fontWeight: active ? 700 : 400,
            letterSpacing: "0.1em", cursor: "pointer", transition: "all 0.12s",
          }}
          onMouseEnter={e => { if (!active) { e.currentTarget.style.color = C.t; e.currentTarget.style.borderColor = C.b2; }}}
          onMouseLeave={e => { if (!active) { e.currentTarget.style.color = C.t3; e.currentTarget.style.borderColor = C.b; }}}
        >
          {label}
        </button>
      );
    })}
  </div>
);