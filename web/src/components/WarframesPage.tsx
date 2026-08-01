import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  C, SlideToggle, SortableTH, TextLink,
  num, pctChange, segBtn, segBtnHover, useSortState,
} from "./shared";
import { oneOf, usePersistentState } from "../prefs";
import { locale, t, tParts, useI18n } from "../i18n";
import type { WarframeStat, WarframesResponse, WfMedians, WfNumKey } from "../types";

// ─── Typografie dieser Seite ──────────────────────────────────────────────────
// Dokumentierte Ausnahme von der Skala `T`: die Seite fährt eine Stufe höher.
// Grund ist der Zweck - es ist eine Vergleichstabelle, die beim Videoschnitt und
// im Stream gelesen wird, nicht am Schreibtisch mit 40 cm Abstand.
//
// Angehoben wird GESCHLOSSEN, wie es die Typo-Regeln verlangen: verschiebt man
// nur die Zahlen, stehen sie mit demselben Gewicht da wie die Spaltenköpfe und
// die Rangfolge bricht. Wer hier eine Zeile ändert, prüft die Nachbarn mit.

const TW: Record<"label" | "meta" | "body" | "bodyStrong" | "num" | "cardTitle", React.CSSProperties> = {
  label:      { fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", color: C.t2 },
  meta:       { fontSize: 14, fontWeight: 500, color: C.t2 },
  body:       { fontSize: 15, fontWeight: 400, color: C.t2 },
  bodyStrong: { fontSize: 16, fontWeight: 600, color: C.t },
  num:        { fontSize: 16, fontWeight: 700, fontFamily: "monospace" },
  cardTitle:  { fontSize: 18, fontWeight: 600, color: C.t },
};

/** segBtn eine Stufe größer, passend zu TW. */
const wfBtn = (active: boolean): React.CSSProperties =>
  ({ ...segBtn(active), fontSize: 14, padding: "6px 14px" });

// ─── Spalten ──────────────────────────────────────────────────────────────────
// Einzige Quelle für Beschriftung, Breite, Nachkommastellen und Erläuterung -
// dasselbe Muster wie SERIES in ItemChart.tsx. Wer eine Spalte ergänzt, ergänzt
// sie hier und nirgends sonst.
//
// Die Umbrüche stehen als \n im Label, nicht im Zufall: „EHP MIT SCHILDEN &
// ÜBERSCHILDEN" brach von allein vierzeilig um und stellte das Undzeichen auf
// eine eigene Zeile.
//
// `invert` gibt es noch nicht: in allen elf Spalten gilt „mehr ist mehr", und
// genau darauf beruht die Einfärbung. Käme eine Spalte dazu, bei der weniger
// besser ist (etwa eine Meisterschaftsanforderung), braucht sie ein Flag -
// sonst behauptet die Farbe das Gegenteil.

interface WfColumn {
  key:    WfNumKey;
  label:  string;
  w:      number;
  digits: 0 | 1 | 2;
  title:  string;
  /** Einheit hinter dem Wert. Nur im Werte-Modus - pctChange bringt sein eigenes %. */
  unit?:  string;
}

const WF_COLUMNS: WfColumn[] = [
  { key: "health",           label: "HEALTH",                 w: 86,  digits: 0, title: "Health at rank 30" },
  { key: "armor",            label: "ARMOR",               w: 105, digits: 0, title: "Armor at rank 30" },
  { key: "dr_pct",           label: "DAMAGE\nREDUCTION",  w: 121, digits: 1, unit: "%", title: "Armor ÷ (armor + 300) - share of damage the armor absorbs" },
  { key: "effective_health", label: "EHP",                   w: 86,  digits: 0, title: "Effective hit points: health × (1 + armor ÷ 300). Shields and overshields not included" },
  { key: "shield",           label: "SHIELDS",               w: 96,  digits: 0, title: "Shields at rank 30" },
  { key: "energy",           label: "ENERGY",               w: 97,  digits: 0, title: "Energy capacity at rank 30" },
  { key: "start_energy",     label: "STARTING\nENERGY",       w: 97,  digits: 0, title: "Energy at mission start - a separate value per Warframe, not half the capacity" },
  { key: "sprint",           label: "SPRINT",                w: 87,  digits: 2, title: "Sprint speed" },
  { key: "max_overshield",   label: "MAXIMUM\nOVERSHIELDS", w: 138, digits: 0, title: "1200 for everyone, 2400 for Harrow. No shields means no overshields" },
  { key: "ehp_shield",       label: "EHP +\nSHIELDS",        w: 96,  digits: 0, title: "Effective hit points + shields. Armor does not apply to shields, they are added raw" },
  { key: "ehp_shield_overshield", label: "EHP + SHIELDS &\nOVERSHIELDS", w: 165, digits: 0, title: "Effective hit points + shields + overshields" },
];

const NAME_W = 167;
const TABLE_W = NAME_W + WF_COLUMNS.reduce((s, c) => s + c.w, 0);
const SPAN = 1 + WF_COLUMNS.length;

// Polsterung und Versal-Sperrung der Köpfe sind gerechnet, nicht geschätzt:
// zwölf Spalten müssen in die 1348 px passen, die eine 1400er Seite innen
// hergibt. Mit der üblichen Polsterung (15) und Sperrung (0.1em) bräuchten die
// Köpfe 1542 px und liefen sichtbar ineinander - tableLayout: fixed schneidet
// Kopftexte nicht ab, es lässt sie überlaufen.
//
// Maßstab für die Zellbreite ist NICHT der größte Absolutwert (1.733 misst
// 49 px), sondern die Abweichung: "+156,8%" misst bei 16 px 68 px. Wer eine
// Spalte schmaler macht, prüft den %-Modus mit.
const CELL_PAD = "10px 9px";
const HEAD_TRACKING = "0.04em";

// ─── Flächen und Fadenkreuz ───────────────────────────────────────────────────
// Zeile UND Spalte hervorheben, die Schnittzelle gerahmt - damit sich ein Wert
// ohne Fingerzeigen der Zeile und der Spalte zuordnen lässt.
//
// Das läuft NICHT über React-State: bei 117 × 12 Zellen würde jede Mausbewegung
// über eine Spaltengrenze die ganze Tabelle neu rendern. Stattdessen setzt ein
// delegierter Handler `data-col` am <table>, und ein erzeugtes Stylesheet macht
// den Rest (Vorbild: .ticker-track in index.css - auch dort reichen
// Inline-Styles nicht).
//
// Klebende Zellen (Namensspalte, Kopf- und Medianzeile) liegen über
// durchlaufenden Zeilen und brauchen deshalb DECKENDE Töne, keine rgba-Schicht.
// SURFACE ist die Fläche der Karte, wie sie über dem Seitenhintergrund
// tatsächlich zusammenfällt; die drei Stufen darunter sind C.hov-Aufschläge,
// vorab verrechnet.
const SURFACE       = "#0a0c1f";
const SURFACE_COL   = "#12131f";   // Spalte
const SURFACE_ROW   = "#17171f";   // Zeile
const SURFACE_CROSS = "#1e1b26";   // Schnittzelle

const TINT_COL   = "rgba(200,168,75,0.05)";
const TINT_ROW   = "rgba(200,168,75,0.07)";
const TINT_CROSS = "rgba(200,168,75,0.13)";

const TBL = "wf-tbl";        // Klassenname, auf den das Stylesheet zielt
const COPIED = "wf-copied";  // kurzzeitige Rückmeldung nach dem Kopieren
const COPY_FLASH_MS = 700;

/**
 * Regeln für Flächen und Fadenkreuz. Erzeugt statt handgeschrieben, damit die
 * Spaltenzahl allein in WF_COLUMNS steht.
 *
 * Reihenfolge = Rangfolge: Grundfläche, Spalte, Zeile, Schnittzelle. Die
 * Schnittregeln stehen zuletzt und sind spezifischer, sonst überschriebe die
 * Zeilenregel sie.
 */
const buildTableCss = (): string => {
  const cols = Array.from({ length: WF_COLUMNS.length + 1 }, (_, i) => i + 1);
  const lines = [
    // Grundflächen der klebenden Zellen - im Stylesheet, nicht inline: ein
    // Inline-Hintergrund schlüge jede Regel und das Fadenkreuz bliebe dort aus.
    `.${TBL} thead th, .${TBL} thead td, .${TBL} tbody th { background: ${SURFACE}; }`,
    // Senkrechte Kante der klebenden Namensspalte, sichtbar beim Querscrollen.
    `.${TBL} tbody th { box-shadow: 1px 0 0 ${C.b}; }`,
    // Spalte
    ...cols.map(n => `.${TBL}[data-col="${n}"] tbody td:nth-child(${n}) { background: ${TINT_COL}; }`),
    ...cols.map(n => `.${TBL}[data-col="${n}"] thead th:nth-child(${n}),`
                   + `.${TBL}[data-col="${n}"] thead td:nth-child(${n}),`
                   + `.${TBL}[data-col="${n}"] tbody th:nth-child(${n}) { background: ${SURFACE_COL}; }`),
    // Klick kopiert den Wert - der Zeiger sagt es vorher. Nur Datenzellen und
    // die Medianzeile; die Kopfzeile sortiert und behält ihren Zeiger.
    `.${TBL} tbody td, .${TBL} tbody th, .${TBL} thead tr + tr td, .${TBL} thead tr + tr th { cursor: copy; }`,
    // Zeile
    `.${TBL} tbody tr:hover td { background: ${TINT_ROW}; }`,
    `.${TBL} tbody tr:hover th { background: ${SURFACE_ROW}; }`,
    // Schnittzelle
    ...cols.map(n => `.${TBL}[data-col="${n}"] tbody tr:hover td:nth-child(${n}) {`
                   + ` background: ${TINT_CROSS}; box-shadow: inset 0 0 0 1px ${C.b2}; }`),
    ...cols.map(n => `.${TBL}[data-col="${n}"] tbody tr:hover th:nth-child(${n}) {`
                   + ` background: ${SURFACE_CROSS}; box-shadow: inset 0 0 0 1px ${C.b2}, 1px 0 0 ${C.b}; }`),
    // Kopier-Rückmeldung. !important, weil die Regeln oben nach Bauart
    // spezifischer sind (Attribut + nth-child) - ohne es bliebe der Blitz
    // ausgerechnet unter dem Mauszeiger unsichtbar, wo er gebraucht wird.
    `.${TBL} .${COPIED} { background: rgba(77,186,127,0.22) !important;`
      + ` box-shadow: inset 0 0 0 1px ${C.up} !important; }`,
  ];
  return lines.join("\n");
};

// Einmal erzeugt, nicht bei jedem Rendern: die Regeln hängen allein an
// WF_COLUMNS, und die Seite rendert bei jeder Sortierung und jedem Filterklick.
const TABLE_CSS = buildTableCss();

type WfGroup = "all" | "prime" | "nonprime";
type WfMode = "abs" | "dev";
type SortKey = "name" | WfNumKey;

const isWfGroup = oneOf<WfGroup>(["all", "prime", "nonprime"]);
const isWfMode = oneOf<WfMode>(["abs", "dev"]);

const GROUPS: { value: WfGroup; label: string }[] = [
  { value: "all",      label: "All" },
  { value: "prime",    label: "Prime" },
  { value: "nonprime", label: "Non-Prime" },
];

// ─── Vergleich mit dem Median ─────────────────────────────────────────────────
// Grün über 110 %, rot unter 90 %, dazwischen neutral - dasselbe Band wie in der
// abgelösten Tabelle. Neutral ist ausdrücklich C.t2 und nicht „keine Farbe":
// eine geerbte Farbe driftet beim nächsten Umbau mit.

const cmpColor = (v: number | null, med: number | null | undefined): string => {
  if (v == null || med == null || med <= 0) return C.t2;
  if (v > med * 1.1) return C.up;
  if (v < med * 0.9) return C.down;
  return C.t2;
};

const deviation = (v: number | null, med: number | null | undefined): number | null =>
  v == null || med == null || med <= 0 ? null : (v / med - 1) * 100;

// ─── Zeilen ───────────────────────────────────────────────────────────────────

const StatCells = ({ item, med, mode }: { item: WarframeStat; med: WfMedians; mode: WfMode }) =>
  <>
    {WF_COLUMNS.map(col => {
      const v = item[col.key];
      const dev = mode === "dev" ? deviation(v, med[col.key]) : null;
      return (
        <td key={col.key} style={{
          padding: CELL_PAD, textAlign: "right", ...TW.num,
          color: cmpColor(v, med[col.key]), whiteSpace: "nowrap",
          // Die Trennlinie gehört auf JEDE Zelle, nicht nur auf die klebende
          // Namensspalte: mit borderCollapse "separate" zeichnet keine Zelle für
          // eine andere mit, und die Linie hörte nach der ersten Spalte auf.
          borderBottom: `1px solid ${C.b}`,
        }}>
          {mode === "dev"
            ? (dev == null ? "-" : pctChange(dev))
            : v == null ? "-" : `${num(v, col.digits)}${col.unit ?? ""}`}
        </td>
      );
    })}
  </>;

// ─── Daten holen, aber nur einmal ─────────────────────────────────────────────
// Die Warframe-Basiswerte ändern sich mit einem Spiel-Update, also grob einmal
// im Monat. Sie bei jedem Betreten des Reiters neu zu holen kostete gemessen
// 384–498 ms bis zur ersten Zeile - und zwar JEDES Mal, weil die Seite bei jedem
// Mounten neu lud.
//
// Deshalb ein Modul-Cache: er überlebt das Aus- und Wiedereinhängen der
// Komponente und wird nur beim Neuladen der Seite verworfen. Serverseitig hängt
// derselbe Datenstand an `metadata.last_updated` (siehe api/main.py), der
// HTTP-Cache trägt ETag und max-age - drei Schichten, die sich ergänzen.

let wfCache: WarframesResponse | null = null;
let wfInFlight: Promise<WarframesResponse> | null = null;

/**
 * Holt die Daten, wenn sie noch nicht da sind - sonst gar nichts.
 *
 * Wird auch beim Überfahren des Reiters aufgerufen (App.tsx). Mehrfachaufrufe
 * bündeln sich über `wfInFlight`: Hover, Hover, Klick lösen zusammen eine
 * einzige Anfrage aus, nicht drei.
 */
export const prefetchWarframes = (): Promise<WarframesResponse> => {
  if (wfCache) return Promise.resolve(wfCache);
  if (wfInFlight) return wfInFlight;
  wfInFlight = fetch("/api/warframes")
    .then(res => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    })
    .then((json: WarframesResponse) => {
      wfCache = json;
      return json;
    })
    .finally(() => { wfInFlight = null; });
  return wfInFlight;
};

// ─── Seite ────────────────────────────────────────────────────────────────────

export const WarframesPage = () => {
  // Am Sprach-Context hängen, damit ein Umschalten sofort durchschlägt: t()
  // liest die Sprache aus einer Modulvariablen und löst von sich aus kein
  // Neuzeichnen aus.
  useI18n();
  const [group, setGroup] = usePersistentState<WfGroup>("vw:wf-group", "all", isWfGroup);
  const [mode, setMode]   = usePersistentState<WfMode>("vw:wf-mode", "abs", isWfMode);
  // Sortierung und Suchtext werden bewusst NICHT gespeichert: die Vorgabe ist
  // alphabetisch, und ein gespeichertes „nach Startenergie absteigend" bräche
  // diese Zusage beim nächsten Besuch stillschweigend.
  const [sortKey, sortDir, handleSort] = useSortState<SortKey>("name", "asc", ["name"]);
  const [query, setQuery] = useState("");

  // Der Cache wird im Initializer gelesen, nicht in einem Effekt: sonst rendert
  // die Seite einen Durchgang lang den Ladezustand, obwohl die Daten längst da
  // sind - genau das Aufblitzen, um das es hier geht.
  const [data, setData]       = useState<WarframesResponse | null>(wfCache);
  const [loading, setLoading] = useState(wfCache === null);
  const [failed, setFailed]   = useState(false);
  const [reload, setReload]   = useState(0);

  // Die Medianzeile klebt unter der Kopfzeile - dafür muss deren Höhe bekannt
  // sein. Gemessen statt gesetzt: die Spaltenköpfe brechen je nach Text auf zwei
  // oder drei Zeilen um, und eine geratene Konstante schob die Medianzeile
  // prompt unter den Kopf.
  const headRef = useRef<HTMLTableRowElement>(null);
  const [headH, setHeadH] = useState(56);
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const measure = () => setHeadH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, failed]);

  // cancelled-Flag wie überall: die Seite kann während des Ladens verlassen und
  // sofort wieder betreten werden.
  useEffect(() => {
    if (wfCache && reload === 0) return;   // schon da, nichts zu tun
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    if (reload > 0) wfCache = null;        // „Erneut versuchen" umgeht den Cache
    prefetchWarframes()
      .then(json => { if (!cancelled) setData(json); })
      .catch(()  => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  const inGroup = useMemo(
    () => (data?.items ?? []).filter(i =>
      group === "all" ? true : group === "prime" ? i.is_prime : !i.is_prime),
    [data, group],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = q ? inGroup.filter(i => i.name.toLowerCase().includes(q)) : inGroup;
    const byName = (a: WarframeStat, b: WarframeStat) => a.name.localeCompare(b.name, locale());
    return [...hit].sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? byName(a, b) : byName(b, a);
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return byName(a, b);
      if (av == null) return 1;               // Leerwerte immer ans Ende
      if (bv == null) return -1;
      // Gleichstand bricht über den Namen. Ohne Tiebreaker springt die
      // Reihenfolge beim Gruppenwechsel - dieselbe Begründung wie i.slug in den
      // Ranglisten der API.
      return av === bv ? byName(a, b) : (sortDir === "desc" ? bv - av : av - bv);
    });
  }, [inGroup, query, sortKey, sortDir]);

  // Der Median hängt an der Filtergruppe, NICHT an der Suche: sonst wäre er beim
  // Tippen ein Median über zwei Zeilen und die Einfärbung sprünge mit jedem
  // Buchstaben.
  const med: WfMedians = data?.medians[group] ?? ({} as WfMedians);
  const thProps = { activeSort: sortKey, sortDir, onSort: handleSort };

  // Spaltenmarkierung: ein Attribut am <table>, kein State. Delegiert, damit
  // nicht 1400 Zellen je einen Handler tragen.
  const onCellOver = (e: React.MouseEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest("td,th") as HTMLTableCellElement | null;
    if (!cell || cell.cellIndex < 0) return;
    const col = String(cell.cellIndex + 1);          // nth-child ist 1-basiert
    if (e.currentTarget.dataset.col !== col) e.currentTarget.dataset.col = col;
  };

  /**
   * Klick kopiert den Zellinhalt - so, wie er dasteht („1.200", „38,1%",
   * „Ash Prime"). Nicht der Rohwert: kopiert wird, was man gerade abliest.
   *
   * Ebenfalls delegiert und ohne State: die Rückmeldung ist eine Klasse am
   * Knoten, die nach kurzer Zeit wieder verschwindet. Über State liefe dafür ein
   * Rerender der gesamten Tabelle.
   */
  const flashTimer = useRef<number | null>(null);
  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current); }, []);

  const onCellClick = async (e: React.MouseEvent<HTMLTableElement>) => {
    const cell = (e.target as HTMLElement).closest("td,th") as HTMLTableCellElement | null;
    if (!cell) return;
    // Die Kopfzeile sortiert, sie kopiert nicht. Die Medianzeile steht ebenfalls
    // im thead, ist aber Inhalt - deshalb die Prüfung auf die Kopfzeile selbst.
    if (cell.parentElement === headRef.current) return;

    // currentTarget JETZT festhalten: React setzt es zurück, sobald der Handler
    // synchron zurückkehrt - nach dem await unten wäre es null.
    const table = e.currentTarget;

    const text = cell.innerText.trim();
    if (!text || text === "-") return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;   // Zwischenablage gesperrt: lieber nichts als eine falsche Zusage
    }
    table.querySelectorAll(`.${COPIED}`).forEach(el => el.classList.remove(COPIED));
    cell.classList.add(COPIED);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => cell.classList.remove(COPIED), COPY_FLASH_MS);
  };

  return (
    <>
      <style>{TABLE_CSS}</style>

      {/* ── Werkzeugleiste: Einheit, Auswahl, dann rechtsbündig die Suche ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
        padding: "12px 18px", marginBottom: 14, backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      }}>
        {/* Derselbe Schalter wie im Dashboard, nur eine Stufe größer. Ohne
            Beschriftung wie dort auch - die Erklärung steht im Tooltip. */}
        <SlideToggle<WfMode>
          ariaLabel={t("Number display")}
          value={mode}
          onChange={setMode}
          size={{ w: 38, h: 32 }}
          options={[
            { key: "dev", label: <span style={{ fontSize: 15, fontWeight: 700 }}>%</span>,
              title: t("Every number as distance from the median of the current selection") },
            { key: "abs", label: <span style={{ fontSize: 16, fontWeight: 700, lineHeight: 1 }}>#</span>,
              title: t("Absolute values at rank 30") },
          ]}
        />

        <div style={{ width: 1, height: 20, background: C.b, flexShrink: 0 }} />

        <div role="group" aria-label={t("Selection")} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ ...TW.label, marginRight: 4, whiteSpace: "nowrap" }}>{t("SELECTION")}</span>
          {GROUPS.map(({ value, label }) => {
            const active = group === value;
            return (
              <button key={value} onClick={() => setGroup(value)} aria-pressed={active}
                style={wfBtn(active)} {...segBtnHover(active)}>
                {t(label)}
              </button>
            );
          })}
        </div>

        {/* marginLeft: auto statt Trennstrich - der Abstand trennt schon. */}
        <div style={{ position: "relative", width: 300, maxWidth: "100%", marginLeft: "auto" }}>
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              pointerEvents: "none", color: C.t2 }}>
            <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <input
            type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder={t("Search Warframe…")} aria-label={t("Search Warframe")} autoComplete="off"
            onFocus={e => (e.currentTarget.style.borderColor = C.gold)}
            onBlur={e => (e.currentTarget.style.borderColor = C.b)}
            style={{
              width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.b}`,
              borderRadius: C.rad, padding: "7px 12px 7px 34px", color: C.t,
              fontSize: 15, fontWeight: 500, outline: "none", transition: "border-color 0.15s",
            }}
          />
        </div>
      </div>

      {/* ── Tabelle ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
        overflow: "hidden", position: "relative", backdropFilter: "blur(10px)",
      }}>
        <div style={{
          padding: "14px 18px", borderBottom: `1px solid ${C.b}`,
          background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={TW.cardTitle}>{t("Warframe base values")}</div>
            <div style={{ ...TW.meta, marginTop: 3 }}>{t("All values at rank 30")}</div>
          </div>
          <span style={{ ...TW.meta, flexShrink: 0 }}>
            {rows.length === inGroup.length
              ? t("%d Warframes in total", rows.length)
              : t("%d of %d Warframes", rows.length, inGroup.length)}
          </span>
        </div>

        {loading ? (
          <div style={{
            padding: "50px 16px", textAlign: "center", color: C.t2,
            fontFamily: "monospace", fontSize: 14, letterSpacing: "0.15em",
          }}>
            {t("LOADING WARFRAMES…")}
          </div>
        ) : failed ? (
          <div style={{ padding: "50px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: C.t, marginBottom: 6 }}>
              {t("Warframe data unavailable")}
            </div>
            <div style={{ ...TW.meta, marginBottom: 14 }}>
              {t("The overview could not be loaded.")}
            </div>
            <button onClick={() => setReload(r => r + 1)}
              style={wfBtn(false)} {...segBtnHover(false)}>
              {t("Try again")}
            </button>
          </div>
        ) : (
          <div style={{
            // Keine minHeight: bei zwei Treffern (Prime und Nicht-Prime) soll die
            // Tabelle kurz unter dem Kopf enden statt eine leere Fläche aufzuspannen.
            overflow: "auto", maxHeight: "calc(100vh - 250px)",
            scrollbarGutter: "stable",
          }}>
            {/* borderCollapse: separate überschreibt das globale collapse aus
                index.css. Bei collapse gehören die Rahmen der Tabelle statt den
                Zellen - die klebende Kopf- und Medianzeile verlöre ihre Kante. */}
            <table
              className={TBL}
              onMouseOver={onCellOver}
              onMouseLeave={e => { delete e.currentTarget.dataset.col; }}
              onClick={onCellClick}
              style={{
                width: "100%", minWidth: TABLE_W, tableLayout: "fixed",
                borderCollapse: "separate", borderSpacing: 0,
              }}>
              <caption style={{
                position: "absolute", width: 1, height: 1, overflow: "hidden",
                clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
              }}>
                {t("Warframe base values at rank 30")}
              </caption>
              <colgroup>
                <col style={{ width: NAME_W }} />
                {WF_COLUMNS.map(c => <col key={c.key} style={{ width: c.w }} />)}
              </colgroup>

              <thead>
                <tr ref={headRef}>
                  {/* color: C.t2 überall, auch für die aktive Spalte. SortableTH
                      würde sie golden setzen - weil die Vorgabesortierung der
                      Name ist, stünde dieser Kopf dann dauerhaft anders da als
                      seine Nachbarn. Welche Spalte sortiert, sagt hier allein
                      das Sortiersymbol (volle Deckkraft, goldener Pfeilarm). */}
                  <SortableTH {...thProps} sortKey="name" style={{
                    position: "sticky", top: 0, left: 0, zIndex: 4,
                    whiteSpace: "nowrap", verticalAlign: "middle", color: C.t2,
                    padding: "10px 9px", fontSize: 13, letterSpacing: HEAD_TRACKING,
                  }}>
                    {t("NAME")}
                  </SortableTH>
                  {WF_COLUMNS.map(col => (
                    <SortableTH key={col.key} {...thProps} right sortKey={col.key} title={t(col.title)}
                      style={{
                        // middle, nicht bottom: einzeilige Titel stehen damit auf
                        // derselben Linie wie NAME, zweizeilige legen sich mittig
                        // darum. Mit bottom saßen sie eine Zeile tiefer.
                        position: "sticky", top: 0, zIndex: 3,
                        verticalAlign: "middle", color: C.t2,
                        whiteSpace: "pre-line", lineHeight: 1.3,
                        padding: "10px 9px", fontSize: 13, letterSpacing: HEAD_TRACKING,
                      }}>
                      {t(col.label)}
                    </SortableTH>
                  ))}
                </tr>

                {/* Medianzeile - der Bezugspunkt, deshalb nie eingefärbt und
                    auch im Abweichungsmodus absolut. Aus „+12,3 %" und dem
                    Median darüber lässt sich der echte Wert zurückrechnen, aus
                    „+12,3 %" und „±0 %" nicht. */}
                <tr>
                  <th scope="row" style={{
                    position: "sticky", top: headH, left: 0, zIndex: 3,
                    textAlign: "left", padding: CELL_PAD,
                    borderBottom: `1px solid ${C.b2}`, ...TW.label, color: C.t,
                  }}>
                    {t("MEDIAN")}
                  </th>
                  {WF_COLUMNS.map(col => (
                    <td key={col.key} style={{
                      position: "sticky", top: headH, zIndex: 2,
                      textAlign: "right", padding: CELL_PAD,
                      borderBottom: `1px solid ${C.b2}`, ...TW.num, color: C.t,
                    }}>
                      {med[col.key] == null ? "-" : `${num(med[col.key], col.digits)}${col.unit ?? ""}`}
                    </td>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={SPAN} style={{
                      textAlign: "center", padding: "32px 16px",
                      color: C.t2, fontSize: 15, fontStyle: "italic",
                    }}>
                      {t("No Warframe matches “%s”", query.trim())}
                    </td>
                  </tr>
                ) : rows.map(item => (
                  <tr key={item.name}>
                    {/* Kein Chevron und kein Aufklappen mehr: der Name beginnt
                        damit an derselben Kante wie „NAME" im Kopf darüber. */}
                    <th scope="row" style={{
                      position: "sticky", left: 0, zIndex: 1,
                      textAlign: "left", padding: CELL_PAD, fontWeight: 400,
                      borderBottom: `1px solid ${C.b}`,
                    }}>
                      <span style={{
                        ...TW.bodyStrong,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        display: "block",
                      }}>
                        {item.name}
                      </span>
                    </th>
                    <StatCells item={item} med={med} mode={mode} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legende - Farbe darf nicht die einzige Auskunft sein. Im Werte-Modus
          steht der Median direkt darüber, im Abweichungsmodus sagt das
          Vorzeichen dasselbe wie die Farbe.

          Ein Hinweis je Zeile: als Fließtext gelesen verschwamm die Farbregel
          mit der Median-Erklärung und der Quellenangabe zu einem Absatz, den
          niemand zu Ende liest. */}
      <div style={{
        ...TW.meta, marginTop: 12, lineHeight: 1.65,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        {/* Sätze mit eingebetteten Elementen laufen über tParts(): der Satz
            bleibt im Wörterbuch als Ganzes stehen, die Teile werden hier um die
            farbigen Wörter bzw. die Links herumgelegt. */}
        <div>
          {(() => {
            const [a, b, c] = tParts("%sGreen%s: more than 10 % above the median · ");
            const [d, e, f] = tParts("%sRed%s: more than 10 % below");
            return <>
              {a}<span style={{ color: C.up, fontWeight: 700 }}>{b}</span>{c}
              {d}<span style={{ color: C.down, fontWeight: 700 }}>{e}</span>{f}
            </>;
          })()}
        </div>
        <div>
          {t("The median is formed column by column over the selected group and therefore describes no real Warframe. The search does not change it.")}
        </div>
        <div>
          {t("Clicking a cell copies its value to the clipboard.")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "2px 0" }}>
          <code style={{
            fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: C.t,
            padding: "5px 11px", border: `1px solid ${C.b}`, borderRadius: C.rad,
            background: "rgba(0,0,0,0.22)", whiteSpace: "nowrap",
          }}>
            {t("EHP = health × (1 + armor ÷ 300)")}
          </code>
          <span>{t("Effective hit points, without shields and overshields")}</span>
        </div>
        <div>
          {(() => {
            const [a, b, c] = tParts("Base values from %s, rank-30 growth and starting energy from %s");
            return <>
              {a}
              <TextLink href="https://github.com/calamity-inc/warframe-public-export-plus"
                target="_blank" rel="noopener" color={C.t2} style={{ fontWeight: 600 }}>
                Warframe Public Export
              </TextLink>
              {b}
              <TextLink href="https://wiki.warframe.com/w/Module:Warframes/data"
                target="_blank" rel="noopener" color={C.t2} style={{ fontWeight: 600 }}>
                {t("Warframe Wiki")}
              </TextLink>
              {c}
            </>;
          })()}
        </div>
      </div>
    </>
  );
};
