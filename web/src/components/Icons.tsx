import React from "react";

// ─── PlatIcon ──────────────────────────────────────────────────────────────────
export const PlatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}>
    <circle cx="7" cy="7" r="6" stroke="#C8A84B" strokeWidth="1.5"/>
    <path d="M4.5 9.5L7 4.5L9.5 9.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.5 7.5H8.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

// ─── SmallPlatIcon ─────────────────────────────────────────────────────────────
export const SmallPlatIcon = () => (
  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ display: "inline", marginRight: 3, verticalAlign: "middle", flexShrink: 0 }}>
    <circle cx="7" cy="7" r="6" stroke="#C8A84B" strokeWidth="1.5"/>
    <path d="M4.5 9.5L7 4.5L9.5 9.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.5 7.5H8.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

// ─── LogoIcon ──────────────────────────────────────────────────────────────────
export const LogoIcon = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <polygon points="14,2 26,8 26,20 14,26 2,20 2,8" stroke="#C8A84B" strokeWidth="1.5" fill="#C8A84B11"/>
    <polygon points="14,7 21,11 21,19 14,23 7,19 7,11" stroke="#C8A84B66" strokeWidth="1" fill="none"/>
    <circle cx="14" cy="15" r="3" fill="#C8A84B"/>
  </svg>
);