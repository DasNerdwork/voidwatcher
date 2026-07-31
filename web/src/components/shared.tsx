import { useState } from "react";
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
  // Raster in Diagrammen. Bewusst von der Textfarbe abgeleitet, nicht vom Gold:
  // Rahmen (C.b/C.b2) und Raster dürfen nicht dieselbe Farbfamilie haben, sonst
  // verschmelzen Struktur und Inhalt. Genau das war der Fehler — die oberste
  // Rasterlinie las sich als dritter Panel-Rahmen.
  grid:   "rgba(232,223,192,0.14)",
  // Achsen — kräftiger als das Raster. Die Volumen-Grundlinie ist die Null-
  // Referenz der Balken und muss ablesbar sein, nicht nur erahnbar; mit dem
  // Rasterwert lag sie bei 14 Stufen Unterschied zur Fläche und verschwand.
  axis:   "rgba(232,223,192,0.30)",
  rad:    "2px",
  radBtn: "2px",
} as const;

// ─── Typografie-Skala ─────────────────────────────────────────────────────────
// Verbindlich für alle neuen Komponenten. Drei Regeln, aus denen sich der Rest ergibt:
//
//   1. Nichts unter 12px. Darunter liest sich Versalsatz als Zeichenfolge, nicht als Wort.
//   2. Text nie auf C.t3 (#7a6e52) — das sind nur 3,8:1 gegen den Hintergrund und
//      damit unter dem AA-Minimum von 4,5:1. Minimum für Text ist C.t2 (8,1:1).
//      C.t3 bleibt Dekoration vorbehalten (Trennlinien, Achsen, Platzhalter).
//   3. Versal-Sperrung höchstens 0.12em — gilt für funktionale Labels. Ausgenommen
//      sind bewusste Display-Elemente: die Wortmarke und die "LADEN..."-Zustände
//      (0.15–0.16em), wo die Sperrung Teil der Gestaltung ist.
//
// Die Skala ist gegenüber der ersten Fassung um eine Stufe angehoben (label 11→12,
// meta 12→13, body/bodyStrong/num 13→14, stat 22→24, hero 30→32). Angehoben wurde
// GESCHLOSSEN, nicht einzeln: verschiebt man nur die Sekundärzeile, verliert sie
// den Abstand zur Zeile darüber und die Rangfolge bricht.
//
// meta trägt 500, nicht 600. Bei 600 hätte Sekundärtext dasselbe Gewicht wie ein
// Itemname (bodyStrong) und unterschiede sich nur noch über die Farbe — 500 hebt
// die Lesbarkeit, ohne die Hierarchie einzuebnen.

export const T: Record<
  "label" | "meta" | "body" | "bodyStrong" | "num" | "numSmall" | "stat" | "hero" | "cardTitle",
  React.CSSProperties
> = {
  /** Versal-Label über Kennzahl oder Filtergruppe ("VOLUMEN", "ZEITRAUM") */
  label:      { fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", color: C.t2 },
  /** Erläuterungs-/Sekundärzeile ("Trades im Zeitraum", "791 Trades") */
  meta:       { fontSize: 13, fontWeight: 500, color: C.t2 },
  /** Fließtext */
  body:       { fontSize: 14, fontWeight: 400, color: C.t2 },
  /** Item-Namen in Listen und Tabellen */
  bodyStrong: { fontSize: 14, fontWeight: 600, color: C.t },
  /** Zahlen in Listen/Tabellen (Preise, Volumen) */
  num:        { fontSize: 14, fontWeight: 700, fontFamily: "monospace" },
  /** Zweitrangige Zahl daneben (Change-%, Rang) */
  numSmall:   { fontSize: 13, fontWeight: 700, fontFamily: "monospace" },
  /** Kennzahl in einer Karte */
  stat:       { fontSize: 24, fontWeight: 700, fontFamily: "monospace", lineHeight: 1.1 },
  /** Leitkennzahl im Seitenkopf */
  hero:       { fontSize: 32, fontWeight: 700, fontFamily: "monospace", lineHeight: 1 },
  /** Kartenüberschrift */
  cardTitle:  { fontSize: 14, fontWeight: 600, color: C.t },
};

// ─── Zahlenformat ─────────────────────────────────────────────────────────────
// Halbe Platin gibt es im Spiel nicht. Die Nachkommastellen entstehen erst durch
// die volumengewichtete Mittelung über den Zeitraum und täuschen eine Genauigkeit
// vor, die es nicht gibt — ob ein Item 47,5 oder 48 Plat kostet, ändert nichts.
//
// Untergrenze 1: 14 Items handeln unter 1 Plat, zwei davon würden auf 0 runden.
// "0 ₱" wäre für ein handelbares Item schlicht falsch.
export const plat = (v?: number | null): string =>
  v == null ? "—" : String(Math.max(1, Math.round(v)));

/** Vorzeichenbehaftete Prozentangabe — hier bleiben Nachkommastellen sinnvoll. */
export const pctChange = (v?: number | null): string =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

// Diagramme bekommen bewusst KEINE eigene Fläche. Ein getönter Kasten war hier
// schon einmal im Einsatz und war falsch: die Seite kennt sonst nur einen
// Flächenton, jede Abweichung wirkt aufgeklebt. Dazu wird der Leerraum, den der
// Chart für Achsenbeschriftung und Legende braucht, erst dann als Loch sichtbar,
// wenn eine Fläche darunter liegt. Die Abgrenzung leisten die Überschrift und
// der Abstand — und dass das Raster (C.grid) nicht mehr wie ein Rahmen aussieht.

// ─── Hover-Konvention ─────────────────────────────────────────────────────────
// Genau zwei Muster, damit sich das nicht wieder auseinanderentwickelt:
//
//   hoverSurface — alles Klickbare mit Fläche: Buttons, Tabellenzeilen,
//                  Suchvorschläge, Nav. Hintergrund hebt sich, Text wird heller.
//   hoverLink    — Textlinks im Fließtext, Header, Footer.
//                  Gold + Unterstrich, kein Hintergrund.
//
// Vorher hatten "Last Update" im Header und die Footer-Links gar keinen Hover.

interface HoverOpts {
  /** Auf false setzen, wenn der aktive Zustand den Hover nicht überschreiben soll */
  active?: boolean;
  /** Rahmenfarbe mit anheben (für Buttons mit sichtbarem Rand) */
  border?: boolean;
  /** Ruhefarbe, auf die zurückgesetzt wird */
  restColor?: string;
  /**
   * Rahmenfarbe im Ruhezustand. Muss zum Style des Buttons passen — sonst
   * bleibt nach dem ersten Hover ein Rahmen stehen, den es vorher nicht gab.
   * Genau das passierte bei den Icon-Schaltern im Listenkopf, die im
   * Ruhezustand "transparent" tragen.
   */
  restBorder?: string;
}

export const hoverSurface = ({
  active = false, border = false, restColor = C.t2, restBorder = C.b,
}: HoverOpts = {}) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    if (active) return;
    e.currentTarget.style.background = C.hov;
    e.currentTarget.style.color      = C.t;
    if (border) e.currentTarget.style.borderColor = C.b2;
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    if (active) return;
    e.currentTarget.style.background = "transparent";
    e.currentTarget.style.color      = restColor;
    if (border) e.currentTarget.style.borderColor = restBorder;
  },
});

/** Nur die Fläche anheben, Textfarbe unangetastet — für Tabellenzeilen. */
export const hoverRow = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = C.hov; },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.background = "transparent"; },
};

export const hoverLink = (restColor: string = C.t2) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color          = C.gold;
    e.currentTarget.style.textDecoration = "underline";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.color          = restColor;
    e.currentTarget.style.textDecoration = "none";
  },
});

/**
 * Item-Seite auf warframe.market. market_items.slug IST der dortige Slug — der
 * Sync liest ihn von dort (sync_api.py: `it.get('slug') or it.get('url_name')`)
 * und benutzt ihn selbst als Pfadsegment für /v2/items/{slug}/statistics. Keine
 * Umformung nötig, encodeURIComponent nur als Absicherung wie bei itemPath.
 */
export const marketUrl = (slug: string) =>
  `https://warframe.market/items/${encodeURIComponent(slug)}`;

/** Textlink mit der Konvention aus hoverLink. Für externe Ziele. */
export const TextLink = ({
  href, color = C.t2, children, style, ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; color?: string }) => (
  <a href={href} {...hoverLink(color)} {...rest}
    style={{ color, textDecoration: "none", textUnderlineOffset: 2, transition: "color 0.12s", ...style }}>
    {children}
  </a>
);

// ─── Kategorie-Farben ─────────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  Warframes: "#5ab4c8",
  Waffen:    "#d45c5c",
  Mods:      "#c8a84b",
  Relics:    "#4dba7f",
  Arcanes:   "#c89050",
  Misc:      "#8a7eb8",
};

export const MISC_SUB_COLORS: Record<string, string> = {
  "Fish":             "#4a9ebb",
  "Skins & Helmets":  "#b87ab8",
  "Scenes":           "#7ab87a",
  "Gems & Resources": "#b8a04a",
  "Ayatan":           "#c87a50",
  "Necramech":        "#8a9ab8",
  "Sonstiges":        "#7a7a7a",
};

export const RARITY_COLORS: Record<string, string> = {
  COMMON:   C.t2,
  UNCOMMON: C.cy,
  RARE:     C.gold,
};

// ─── ItemThumb ────────────────────────────────────────────────────────────────
// Bild aus thumb_path/image_path, Fallback auf Initialen.

export const ItemThumb = ({ path, name, size = 28 }: { path?: string | null; name: string; size?: number }) => {
  const [failed, setFailed] = useState(false);

  if (path && !failed) {
    return (
      <img src={path} width={size} height={size} alt="" onError={() => setFailed(true)}
        style={{
          borderRadius: C.rad, flexShrink: 0, objectFit: "contain", display: "block",
          background: "rgba(200,168,75,0.06)",
        }} />
    );
  }

  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: C.rad, flexShrink: 0,
      background: "rgba(200,168,75,0.12)", border: `1px solid ${C.b}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, color: C.gold, fontWeight: 700, letterSpacing: "-0.02em",
    }}>
      {initials}
    </div>
  );
};

// ─── CategoryBadge ────────────────────────────────────────────────────────────
export const CategoryBadge = ({ cat }: { cat: string }) => {
  const color = CATEGORY_COLORS[cat] || C.t3;
  return (
    <span style={{
      fontSize: 12, padding: "1px 7px", borderRadius: C.rad,
      color, background: `${color}20`, fontWeight: 500, whiteSpace: "nowrap",
    }}>{cat}</span>
  );
};

// ─── Tag options ──────────────────────────────────────────────────────────────
// Kategorien der Filterleisten — identisch auf Dashboard, Movers und Farm Value.
// Die Zuordnung Schlüssel → Tag-Bedingung steht in api/db.py (_CATEGORY_FILTERS).
//
// Entfallen sind "Warframes" (der Tag 'warframe' meint "gehört zu Warframes" und
// enthielt nur Mods und Prime-Teile, keinen einzigen Warframe) und "Ressourcen"
// (Tag 'resource' existiert nicht). "Arcanes" lief ins Leere, weil der Tag
// 'arcane_enhancement' heißt. "Weapons" meint jetzt Nicht-Prime-Waffen.
export const TAG_OPTIONS: { label: string; value: string | null }[] = [
  { label: "Alle",    value: null },
  { label: "Mods",    value: "mod" },
  { label: "Arcanes", value: "arcane" },
  { label: "Prime",   value: "prime" },
  { label: "Weapons", value: "weapon" },
  { label: "Relics",  value: "relic" },
];

// ─── Zeiträume ────────────────────────────────────────────────────────────────
// Werte und Beschriftung standen doppelt: inline in App.tsx für die Buttons und
// noch einmal als HOURS_LABELS in DashboardPage.tsx für die Unterzeilen. 2160 h
// = 90 Tage, die volle Tiefe von market_stats_90d.
export const HOURS_OPTIONS = [24, 48, 168, 336, 720, 2160] as const;

export const HOURS_LABELS: Record<number, string> = {
  24: "24H", 48: "48H", 168: "7T", 336: "14T", 720: "30T", 2160: "90T",
};

// Ausgeschriebene Fassung für Unterzeilen. Bewusst eine eigene Tabelle statt einer
// Ableitung: aus „7T" entsteht kein Satz, ohne die Einheit erneut zu entscheiden
// (Stunden bis 48, danach Tage). Wer HOURS_OPTIONS erweitert, muss BEIDE Tabellen
// ergänzen — ein fehlender Eintrag zeigt sich als leere Zeile, nicht als Fehler.
// „Letzte 48 Stunden" statt „In den letzten 48 Stunden": die lange Fassung brach
// in der KPI-Kachel um (167px Textbreite bei 13px reichen für rund 24 Zeichen,
// die Stunden-Varianten liegen darüber). Gemessen, nicht geschätzt.
export const HOURS_PHRASE: Record<number, string> = {
    24: "Letzte 24 Stunden",
    48: "Letzte 48 Stunden",
   168: "Letzte 7 Tage",
   336: "Letzte 14 Tage",
   720: "Letzte 30 Tage",
  2160: "Letzte 90 Tage",
};

// ─── Filter-Controls ──────────────────────────────────────────────────────────
// Inaktive Buttons standen auf C.t3 (#7a6e52) — gegen den Seitenhintergrund nur
// 3,8:1 Kontrast und damit unter dem AA-Minimum von 4,5:1. Auf C.t2 sind es 8,1:1.
// Dazu 12px statt 10px und deutlich weniger letterSpacing: Versalien mit weiter
// Sperrung lesen sich bei Kleinstgrößen als Zeichenfolge, nicht als Wort.

export const segBtn = (active: boolean, color: string = C.gold): React.CSSProperties => ({
  padding: "5px 13px",
  border: active ? `1px solid ${color}88` : `1px solid ${C.b}`,
  borderRadius: C.radBtn,
  background: active ? `${color}14` : "transparent",
  color: active ? color : C.t2,
  fontSize: 13, fontWeight: active ? 700 : 500,
  letterSpacing: "0.04em", cursor: "pointer", transition: "all 0.12s",
  lineHeight: 1.35, fontFamily: "inherit",
});

/**
 * Hover-Handler passend zu segBtn. Dünner Wrapper um hoverSurface, damit es
 * für dasselbe Verhalten nicht zwei Implementierungen gibt.
 */
export const segBtnHover = (active: boolean) => hoverSurface({ active, border: true });

/** Versal-Label vor einer Filtergruppe ("ZEITRAUM", "KATEGORIE", …). */
export const FilterLabel = ({ children }: { children: React.ReactNode }) => (
  <span style={{
    fontSize: 12, fontWeight: 600, color: C.t2,
    letterSpacing: "0.12em", marginRight: 6, whiteSpace: "nowrap",
  }}>
    {children}
  </span>
);

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
  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
    <FilterLabel>KATEGORIE</FilterLabel>
    {TAG_OPTIONS.map(({ label, value }) => {
      const active = activeTag === value;
      return (
        <button key={label} onClick={() => onChange(value)}
          style={segBtn(active)} {...segBtnHover(active)}>
          {label}
        </button>
      );
    })}
  </div>
);