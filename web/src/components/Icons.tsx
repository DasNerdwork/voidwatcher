import PlatinumSmall from "../assets/PlatinumSmall.avif";

// ─── PlatIcon ──────────────────────────────────────────────────────────────────
export const PlatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}>
    <circle cx="7" cy="7" r="6" stroke="#C8A84B" strokeWidth="1.5" />
    <path d="M4.5 9.5L7 4.5L9.5 9.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5.5 7.5H8.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

// ─── SmallPlatIcon ─────────────────────────────────────────────────────────────
export const SmallPlatIcon = () => (
  <img src={PlatinumSmall} style={{ display: "inline", marginLeft: 3, verticalAlign: "middle", flexShrink: 0 }} alt="" />
);

// ─── LogoIcon ──────────────────────────────────────────────────────────────────
export const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <polygon points="16,2 28,8 28,24 16,30 4,24 4,8" stroke="#C8A84B" strokeWidth="1.5" fill="#C8A84B11" />
    <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" stroke="#C8A84B66" strokeWidth="1" fill="none" />
    <circle cx="16" cy="15" r="3" fill="#C8A84B" />
  </svg>
);