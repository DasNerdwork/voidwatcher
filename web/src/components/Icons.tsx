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

// ─── Ansichts-Icons ────────────────────────────────────────────────────────────
// Für den Umschalter im Listenkopf des Dashboards. Erben die Farbe vom Button
// (currentColor), Strichstärke 1.3 wie bei den übrigen Icons.

const iconProps = {
  width: 18, height: 18, viewBox: "0 0 16 16", fill: "none",
  stroke: "currentColor", strokeWidth: 1.3,
  strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  style: { display: "block" },
};

/** Preisanstieg — Pfeil aufwärts */
export const TrendUpIcon = () => (
  <svg {...iconProps}>
    <path d="M2 11.5L6 7L9 10L14 4.5" />
    <path d="M10.5 4.5H14V8" />
  </svg>
);

/** Preisrückgang — Pfeil abwärts */
export const TrendDownIcon = () => (
  <svg {...iconProps}>
    <path d="M2 4.5L6 9L9 6L14 11.5" />
    <path d="M10.5 11.5H14V8" />
  </svg>
);

/** Meistgehandelt — zwei gegenläufige Pfeile */
export const TradeIcon = () => (
  <svg {...iconProps}>
    <path d="M2.5 5.5H12" />
    <path d="M9.5 3L12 5.5L9.5 8" />
    <path d="M13.5 10.5H4" />
    <path d="M6.5 8L4 10.5L6.5 13" />
  </svg>
);

/** Teuerstes Item — Platin-Symbol (wie PlatIcon, aber ohne feste Farbe) */
/**
 * Edelstein im Brillantschliff — geläufiges Wertsymbol. Der frühere Kreis mit
 * Spitze und Querstrich las sich als eingekreistes „A" und gab keinen Hinweis
 * auf „teuer".
 */
export const ValueIcon = () => (
  <svg {...iconProps}>
    <path d="M5.5 3.5H10.5L13.2 6.6L8 13.3L2.8 6.6Z" />
    <path d="M2.8 6.6H13.2" />
    <path d="M5.5 3.5L6.5 6.6L8 13.3" />
    <path d="M10.5 3.5L9.5 6.6L8 13.3" />
  </svg>
);

// ─── ExternalLinkIcon ──────────────────────────────────────────────────────────
/**
 * Rahmen mit oben rechts austretendem Pfeil — das etablierte Zeichen für „führt
 * auf eine fremde Seite".
 *
 * Zwei Abweichungen von iconProps oben, beide beabsichtigt: 11px statt 18px,
 * weil dieses Icon neben 12px-Text steht statt in einem 30px-Button; und
 * strokeWidth 1.6 statt 1.3, weil der Strich mitskaliert — bei 11/16 ergäbe 1.3
 * nur 0,9px und liefe grau aus.
 *
 * currentColor ist hier tragend, nicht Gewohnheit: hoverLink setzt beim
 * Überfahren die color des Links, das Icon färbt sich dadurch ohne eigenen
 * Hover-Zustand mit. aria-hidden, weil die Bedeutung im Linktext steht.
 */
export const ExternalLinkIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false"
    style={{ display: "inline-block", verticalAlign: "middle", marginLeft: 5, flexShrink: 0 }}>
    <path d="M8.5 2.5H2.5V13.5H13.5V7.5" />
    <path d="M10 2.5H13.5V6" />
    <path d="M13.5 2.5L7.5 8.5" />
  </svg>
);

// ─── LogoIcon ──────────────────────────────────────────────────────────────────
export const LogoIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <polygon points="16,2 28,8 28,24 16,30 4,24 4,8" stroke="#C8A84B" strokeWidth="1.5" fill="#C8A84B11" />
    <polygon points="16,7 23,11 23,21 16,25 9,21 9,11" stroke="#C8A84B66" strokeWidth="1" fill="none" />
    <circle cx="16" cy="15" r="3" fill="#C8A84B" />
  </svg>
);