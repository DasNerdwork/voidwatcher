import { useCallback, useMemo, useRef, useState } from "react";
import PlatinumSmall from "../assets/PlatinumSmall.avif";
import { C, T } from "./shared";
import { locale, t } from "../i18n";
import { usePersistentState } from "../prefs";
import type { HistoryPoint } from "../types";

// ─── ItemChart ────────────────────────────────────────────────────────────────
// Zwei gestapelte Panels (Preis + Volumen) auf gemeinsamer, ZEITproportionaler
// X-Achse. Die Vorgängerversion positionierte über den Array-Index - dadurch
// wurden Handelspausen zusammengestaucht und die Achse zeigte etwas anderes an,
// als die Beschriftung behauptete.
//
// Ausgelegt auf wenige Datenpunkte: das Median-Item hat nur 11 Punkte in 48h,
// 25% haben ≤3, und "7T" sind immer exakt 7 Tageswerte.

// ─── Serien ───────────────────────────────────────────────────────────────────

type SeriesKey = "median" | "movingAvg" | "range" | "donchian" | "candles";

interface SeriesDef {
  key:     SeriesKey;
  label:   string;
  color:   string;
  /** Ohne diese Felder lässt sich die Serie nicht zeichnen */
  needs:   (keyof HistoryPoint)[];
  default: boolean;
}

// Reihenfolge = Legendenreihenfolge: erst was den Preis beschreibt, dann die
// technischen Indikatoren.
//
// Median und Gleitender Durchschnitt kommen von warframe.market selbst und lagen
// bereits vollständig in der DB und in HistoryPoint - es fehlte nur der Eintrag
// hier. Der Median ist keine Dublette des Mittelwerts: bei Tagesauflösung weicht
// er in knapp der Hälfte der Buckets ab (bei Stundenauflösung in 16 %, dort hat
// ein Bucket oft nur ein bis zwei Trades und beide Werte fallen zusammen).
//
// „needs" gated die Serie automatisch: moving_avg fehlt bei dünn gehandelten
// Items (87 % gefüllt stündlich, 97 % täglich), die Schaltfläche graut dann aus.
const SERIES: SeriesDef[] = [
  { key: "median",    label: "Median",                 color: "#c07ad4", needs: ["median"],                     default: true  },
  { key: "movingAvg", label: "Moving average", color: "#7a9ed4", needs: ["moving_avg"],                default: false },
  { key: "range",     label: "Min–Max",                color: "#8fa0b8", needs: ["min_price", "max_price"],     default: false },
  { key: "donchian",  label: "Donchian channel",         color: C.gold,    needs: ["donch_top", "donch_bot"],     default: true  },
  { key: "candles",   label: "Candlesticks",           color: C.cy,      needs: ["open_price", "closed_price"], default: false },
];

const STORE_KEY = "vw:chart-series";

const SERIES_DEFAULTS = Object.fromEntries(
  SERIES.map(s => [s.key, s.default]),
) as Record<SeriesKey, boolean>;

// Gespeichert wird immer der vollständige Satz, gelesen wird trotzdem tolerant:
// ein Stand aus einer Version mit weniger Serien darf die neue nicht auf
// undefined setzen. Der Guard nimmt jedes Objekt an, der Spread füllt den Rest.
const acceptSeries = (v: unknown): v is Record<SeriesKey, boolean> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ─── Zeitachse ────────────────────────────────────────────────────────────────

/**
 * Zeitstempel der API in Millisekunden.
 *
 * Der Sonderfall ist wichtig: bei Tagesauflösung liefert die API reine Datums-
 * werte ("2026-07-30"). `new Date()` liest die als UTC-Mitternacht, dargestellt
 * wird aber in Lokalzeit - jeder Punkt saß dadurch um den Zonenoffset versetzt
 * und die Tagesbeschriftung konnte einen Tag danebenliegen. Mit explizitem
 * "T00:00:00" (ohne Z) parst der Browser als LOKALE Mitternacht.
 */
const parseStamp = (t: string): number =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00` : t).getTime();

/**
 * Rasterweiten für die Zeitachse - das Gegenstück zu niceStep auf der Y-Achse.
 *
 * Vorher wurde die Spanne in fünf gleiche Bruchteile geteilt. 48 h ÷ 5 = 9 h 36 min,
 * daher die krummen Beschriftungen wie 02:48 und 16:24. Jetzt wird die kleinste
 * Stufe gewählt, die höchstens MAX_TICKS Marken ergibt, und auf sie gerundet.
 */
const HOUR = 3600_000;
const DAY  = 24 * HOUR;
const TIME_STEPS_HOUR = [1, 2, 3, 6, 12, 24].map(h => h * HOUR);
const TIME_STEPS_DAY  = [1, 2, 7, 14, 30, 90].map(d => d * DAY);
const MAX_TICKS = 6;

/** Farben der Serien, per Schlüssel greifbar ohne SERIES zu durchsuchen. */
const SERIES_COLOR = Object.fromEntries(
  SERIES.map(s => [s.key, s.color]),
) as Record<SeriesKey, string>;

const niceTimeStep = (span: number, res: "hour" | "day"): number => {
  const ladder = res === "hour" ? TIME_STEPS_HOUR : TIME_STEPS_DAY;
  return ladder.find(s => span / s <= MAX_TICKS - 1) ?? ladder[ladder.length - 1];
};

/**
 * Nächste Rastergrenze ab `ms` - auf LOKALE Grenzen, nicht auf Epoch-Vielfache.
 *
 * Epoch-Rundung trifft nur bei Zonen mit vollem Stundenoffset zufällig das
 * Richtige; Indien (+5:30) oder Nepal (+5:45) lägen daneben. Deshalb wird der
 * Zonenoffset herausgerechnet, gerundet und wieder addiert.
 */
const ceilToStep = (ms: number, step: number): number => {
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return Math.ceil((ms - offset) / step) * step + offset;
};

// ─── Formatierung ─────────────────────────────────────────────────────────────

/**
 * Achsenbeschriftung. Bei Stundenauflösung trägt die Marke um Mitternacht das
 * DATUM statt der Uhrzeit - ein 48H-Fenster zeigt sonst zweimal „00:00" ohne
 * Hinweis darauf, dass ein Tageswechsel dazwischenliegt.
 */
const fmtAxis = (ms: number, res: "hour" | "day") => {
  const d = new Date(ms);
  const dateLabel = d.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit" });
  if (res === "day") return dateLabel;
  return d.getHours() === 0 && d.getMinutes() === 0
    ? dateLabel
    : d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
};

const fmtFull = (ms: number, res: "hour" | "day") => {
  const d = new Date(ms);
  return res === "hour"
    ? d.toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "numeric" });
};

const num = (v?: number | null, digits = 1) => (v != null ? v.toFixed(digits) : "-");

// ─── Legende ──────────────────────────────────────────────────────────────────

const LegendToggle = ({
  def, active, disabled, onClick,
}: {
  def: SeriesDef; active: boolean; disabled: boolean; onClick: () => void;
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    title={disabled ? "Für dieses Item liegen noch keine Daten vor" : undefined}
    style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "4px 11px", borderRadius: C.radBtn,
      border: `1px solid ${active && !disabled ? `${def.color}88` : C.b}`,
      background: active && !disabled ? `${def.color}14` : "transparent",
      color: disabled ? C.t3 : active ? def.color : C.t2,
      fontSize: 13, fontWeight: active ? 700 : 500,
      fontFamily: "inherit", letterSpacing: "0.04em",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1, transition: "all 0.12s",
    }}
  >
    <span style={{
      width: 9, height: 9, borderRadius: 1, flexShrink: 0,
      background: active && !disabled ? def.color : "transparent",
      border: `1px solid ${disabled ? C.t3 : def.color}`,
    }} />
    {t(def.label)}
  </button>
);

// ─── ItemChart ────────────────────────────────────────────────────────────────

interface ItemChartProps {
  points:      HistoryPoint[];
  resolution:  "hour" | "day";
  /** Untergrenze; der Chart füllt darüber hinaus die Höhe des Containers */
  minHeight?:  number;
}

export const ItemChart = ({ points, resolution, minHeight = 300 }: ItemChartProps) => {
  const roRef = useRef<ResizeObserver | null>(null);
  const [size, setSize]       = useState({ w: 600, h: minHeight });
  const [hover, setHover]     = useState<number | null>(null);
  const [stored, setStored]   = usePersistentState<Record<SeriesKey, boolean>>(
    STORE_KEY, SERIES_DEFAULTS, acceptSeries,
  );
  const enabled = { ...SERIES_DEFAULTS, ...stored };

  // Breite UND Höhe messen. Vorher wurde nur die Breite beobachtet und die Höhe
  // als feste Prop gesetzt - im Dashboard blieben dadurch 235px Container leer.
  // Callback-Ref statt useEffect: das beobachtete Element wechselt, sobald aus
  // dem Leerzustand ein Chart wird. Ein einmal im Effect verdrahteter Observer
  // hinge danach an einem abgehängten Knoten.
  const observeBox = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const toggle = (k: SeriesKey) => setStored({ ...enabled, [k]: !enabled[k] });

  const data = useMemo(
    () => points
      .filter(p => p.avg_price != null)
      .map(p => ({ ...p, ms: parseStamp(p.t) }))
      .sort((a, b) => a.ms - b.ms),
    [points],
  );

  // Eine Serie ist nur verfügbar, wenn mindestens ein Punkt alle nötigen Felder hat
  const available = useMemo(() => {
    const out = {} as Record<SeriesKey, boolean>;
    for (const s of SERIES) {
      out[s.key] = data.some(p => s.needs.every(f => p[f] != null));
    }
    return out;
  }, [data]);

  if (data.length < 2) {
    return (
      <div ref={observeBox} style={{
        width: "100%", height: "100%", minHeight, display: "flex",
        alignItems: "center", justifyContent: "center",
        ...T.meta, fontStyle: "italic",
      }}>
        {t("Not enough trade data for a chart in this period")}
      </div>
    );
  }

  const { w, h } = size;
  // h ist die Höhe der Plotfläche, nicht die der ganzen Komponente: die Legende
  // liegt außerhalb des beobachteten Bereichs. Früher wurde von der Gesamthöhe
  // eine KONSTANTE Legendenhöhe von 40px abgezogen - sobald die Legende umbrach,
  // wuchs der Chart mit jedem Messzyklus um die Differenz weiter.
  const H = Math.max(h, 80);
  // Rechter Rand richtet sich nach der längsten Achsenbeschriftung - bei
  // sechsstelligen Preisen schnitt ein fester Wert die Labels ab.
  const axisDigits = String(Math.round(
    points.reduce((m, p) => Math.max(m, p.avg_price ?? 0), 1),
  )).length;
  // Untergrenze 84px: der längste Achsentitel ("ZEITRAUM") ist breiter als
  // die Zahlenspalte samt Platin-Icon
  const padR    = Math.max(84, 34 + Math.max(4, Math.min(axisDigits, 6)) * 7.5);
  const pad     = { t: 14, r: padR, b: 26, l: 10 };
  const gap     = 12;
  const volH    = Math.round((H - pad.t - pad.b) * 0.26);
  const priceH  = H - pad.t - pad.b - volH - gap;
  const iw      = Math.max(w - pad.l - pad.r, 10);

  const showCandles   = enabled.candles   && available.candles;
  const showDonchian  = enabled.donchian  && available.donchian;
  const showMedian    = enabled.median    && available.median;
  const showMovingAvg = enabled.movingAvg && available.movingAvg;
  const showRange     = enabled.range     && available.range;

  // ── Skalen ──
  const t0 = data[0].ms;
  const t1 = data[data.length - 1].ms;
  const tSpan = t1 - t0 || 1;

  // Balken-/Kerzenbreite aus dem MEDIANEN Zeitabstand, nicht aus iw/n:
  // bei Handelslücken wären die Körper sonst absurd breit.
  const deltas = data.slice(1).map((p, i) => p.ms - data[i].ms).sort((a, b) => a - b);
  const medianDelta = deltas.length ? deltas[Math.floor(deltas.length / 2)] : tSpan;
  const bodyW = Math.max(3, Math.min(14, (medianDelta / tSpan) * iw * 0.72));

  // Plotbereich um eine halbe Körperbreite einrücken, sonst schneidet der
  // SVG-Rand die erste und letzte Kerze bzw. den Volumenbalken an.
  const inset = bodyW / 2 + 1;
  const plotL = pad.l + inset;
  const plotW = Math.max(iw - 2 * inset, 10);
  const toX = (ms: number) => plotL + ((ms - t0) / tSpan) * plotW;

  // Wertebereich: die PREISE geben die Skala vor, nicht der Donchian-Kanal.
  // Sonst reicht ein einzelnes absurdes Angebot (z.B. ein Fisch mit donch_top
  // 108.000 Plat), um den gesamten Verlauf auf eine Nulllinie zu drücken.
  // Der Kanal darf die Skala nur um ein Vielfaches der Preisspanne dehnen,
  // darüber hinaus wird er am Rand abgeschnitten (clipPath weiter unten).
  const priceVals: number[] = [];
  for (const p of data) {
    priceVals.push(p.avg_price!);
    if (p.min_price != null) priceVals.push(p.min_price);
    if (p.max_price != null) priceVals.push(p.max_price);
  }
  const sortedVals = priceVals.slice().sort((a, b) => a - b);
  const quantile = (f: number) =>
    sortedVals[Math.min(sortedVals.length - 1, Math.round(f * (sortedVals.length - 1)))];

  // Ausreißer-Kappung nach der IQR-Zaun-Regel (Q3 + 3·IQR). Auf warframe.market
  // stehen regelmäßig Scherzangebote - goopolla hat Tage mit 99.999 Plat bei
  // einem Normalpreis von 1–2 Plat. Ohne Kappung drückt ein einziger solcher Tag
  // 90 Tage Verlauf auf eine Nulllinie.
  // Ein fester Perzentilwert reicht nicht, weil es auch mehrere Ausreißer gibt;
  // der IQR-Zaun passt sich der tatsächlichen Verteilung an.
  // Gekappt wird nur die SKALA - die Werte bleiben im Tooltip sichtbar, und die
  // Legende weist auf die Kappung hin.
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;
  const fenceHi = iqr > 0 ? q3 + 3 * iqr : Infinity;
  const fenceLo = iqr > 0 ? q1 - 3 * iqr : -Infinity;

  const trueMax = Math.max(...priceVals);
  const trueMin = Math.min(...priceVals);
  const pMax = trueMax > fenceHi ? Math.max(...priceVals.filter(v => v <= fenceHi), q3) : trueMax;
  const pMin = trueMin < fenceLo ? Math.min(...priceVals.filter(v => v >= fenceLo), q1) : trueMin;
  const pSpan = pMax - pMin || pMax || 1;

  let rawMin = pMin;
  let rawMax = pMax;
  if (showDonchian) {
    const limitLo = pMin - pSpan * 1.5;
    const limitHi = pMax + pSpan * 1.5;
    for (const p of data) {
      if (p.donch_top != null && p.donch_top <= limitHi) rawMax = Math.max(rawMax, p.donch_top);
      if (p.donch_bot != null && p.donch_bot >= limitLo) rawMin = Math.min(rawMin, p.donch_bot);
    }
  }

  const headroom = (rawMax - rawMin || rawMax || 1) * 0.08;
  const mn = Math.max(0, rawMin - headroom);
  const mx = rawMax + headroom;
  const range = mx - mn || 1;
  const toY = (v: number) => pad.t + (1 - (v - mn) / range) * priceH;

  // Erst jetzt steht fest, ob wirklich etwas außerhalb der Skala liegt
  const clipped = trueMax > mx;

  const maxVol = Math.max(...data.map(p => p.volume ?? 0), 1);
  const volTop = pad.t + priceH + gap;

  // ── Pfade ──
  const line = (get: (p: typeof data[number]) => number | null | undefined) => {
    const segs: string[] = [];
    let open = false;
    for (const p of data) {
      const v = get(p);
      if (v == null) { open = false; continue; }
      segs.push(`${open ? "L" : "M"}${toX(p.ms).toFixed(1)},${toY(v).toFixed(1)}`);
      open = true;
    }
    return segs.join(" ");
  };

  const avgPath = line(p => p.avg_price);

  /** Geschlossene Fläche zwischen einer oberen und einer unteren Reihe. */
  const band = (
    top: (p: typeof data[number]) => number | null | undefined,
    bot: (p: typeof data[number]) => number | null | undefined,
  ) => {
    const pts = data.filter(p => top(p) != null && bot(p) != null);
    if (pts.length < 2) return "";
    return [
      ...pts.map((p, i) => `${i ? "L" : "M"}${toX(p.ms).toFixed(1)},${toY(top(p)!).toFixed(1)}`),
      ...pts.slice().reverse().map(p => `L${toX(p.ms).toFixed(1)},${toY(bot(p)!).toFixed(1)}`),
      "Z",
    ].join(" ");
  };

  const donchPath = band(p => p.donch_top, p => p.donch_bot);
  const rangePath = band(p => p.max_price, p => p.min_price);

  const first = data[0].avg_price!;
  const last  = data[data.length - 1].avg_price!;
  const up    = last >= first;
  const col   = up ? C.up : C.down;

  // Marker sobald die Punkte einzeln unterscheidbar sein sollten
  const showDots = data.length <= 40 && !showCandles;

  // ── Achsen ──
  // Achsenwerte auf runde GANZE Zahlen legen. Die Spanne in fünf gleiche Teile
  // zu schneiden ergab bei billigen Items "0.8 / 1.6 / 2.4" - halbe Platin gibt
  // es aber nicht. Stattdessen eine Schrittweite aus 1/2/5/10/20/50/… wählen,
  // die auf 4–6 Markierungen kommt.
  const niceStep = (span: number) => {
    const rough = span / 5;
    const mag   = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1))));
    for (const m of [1, 2, 5, 10]) {
      if (mag * m >= rough) return Math.max(1, mag * m);
    }
    return Math.max(1, mag * 10);
  };
  const step = niceStep(range);
  const yTicks: { y: number; label: string }[] = [];
  for (let v = Math.ceil(mn / step) * step; v <= mx + step * 0.01; v += step) {
    yTicks.push({ y: toY(v), label: String(Math.round(v)) });
  }
  if (yTicks.length < 2) yTicks.push({ y: toY(mx), label: String(Math.round(mx)) });

  // Marken auf gerasterten Zeiten statt auf Fünftel-Bruchteilen der Spanne.
  //
  // Der Dedup-Schutz gilt NUR für Tagesauflösung, wo eine kurze Spanne zweimal
  // dasselbe „dd.mm" ergeben kann. Bei Stundenauflösung wäre er falsch: dort
  // sind zwei Marken um Mitternacht zwei verschiedene Tage, und fmtAxis
  // beschriftet sie ohnehin mit dem Datum statt der Uhrzeit.
  //
  // KEIN useMemo - und das ist wichtig: diese Stelle liegt hinter dem
  // vorzeitigen Return `if (data.length < 2)` weiter oben. Ein Hook hier ruft
  // die Komponente je nach Datenlage unterschiedlich oft auf und React bricht
  // mit Fehler #300 ab („Rendered fewer hooks than expected"), sobald ein
  // Zeitraumwechsel von ≥2 auf <2 Punkte führt - dieselbe Instanz bleibt dabei
  // montiert, weil der key nur am Itemnamen hängt.
  //
  // Ein Memo wäre hier ohnehin unangemessen: die Schleife läuft über höchstens
  // MAX_TICKS Marken. Hooks gehören in dieser Komponente ausnahmslos VOR den
  // Early Return.
  const xTicks: { x: number; label: string }[] = [];
  {
    const step = niceTimeStep(tSpan, resolution);
    const seen = new Set<string>();
    for (let ms = ceilToStep(t0, step); ms <= t1; ms += step) {
      const label = fmtAxis(ms, resolution);
      if (resolution === "day" && seen.has(label)) continue;
      seen.add(label);
      xTicks.push({ x: toX(ms), label });
    }
    // Fällt keine Rastergrenze ins Fenster (sehr kurze Spanne), wenigstens die
    // beiden Ränder beschriften - eine Achse ganz ohne Marken ist schlechter.
    if (xTicks.length === 0) {
      xTicks.push({ x: toX(t0), label: fmtAxis(t0, resolution) });
      if (t1 > t0) xTicks.push({ x: toX(t1), label: fmtAxis(t1, resolution) });
    }
  }

  const hp = hover != null ? data[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ms   = t0 + ((e.clientX - rect.left - plotL) / plotW) * tSpan;
    // Auf den zeitlich nächsten Punkt einrasten - bei ungleichen Abständen
    // wäre eine Index-Rechnung daneben.
    let best = 0, bestD = Infinity;
    data.forEach((p, i) => {
      const d = Math.abs(p.ms - ms);
      if (d < bestD) { bestD = d; best = i; }
    });
    setHover(best);
  };

  return (
    // Spalte aus Plotfläche und Legende. Die Plotfläche ist das beobachtete
    // Element; das SVG darin liegt ABSOLUT und trägt damit nichts zur Layout-
    // höhe bei. Genau das bricht die Rückkopplung: die Legende darf beliebig
    // umbrechen, die Plotfläche schrumpft entsprechend, statt dass beide sich
    // gegenseitig aufschaukeln.
    <div style={{
      width: "100%", height: "100%", minHeight,
      display: "flex", flexDirection: "column",
    }}>
    <div ref={observeBox} style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <svg width={w} height={H} style={{ display: "block", overflow: "hidden", position: "absolute", top: 0, left: 0 }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="vwAvgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={col} stopOpacity="0.20" />
            <stop offset="100%" stopColor={col} stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="vwPriceClip">
            <rect x={pad.l} y={pad.t} width={w - pad.l - pad.r} height={priceH} />
          </clipPath>
        </defs>

        {/* Gitter - einheitlich gepunktet, ohne Sonderrolle für die Randticks.
            Die waren vorher durchgezogen, um einen Rahmen anzudeuten, markierten
            aber gar nicht die Panelkante: yTicks entstehen aus gerundeten Werten
            INNERHALB des Wertebereichs (siehe oben), die oberste Linie lag also
            auf einem Datenwert. Sie sah aus wie eine Grenze und lag woanders. */}
        {yTicks.map(({ y }, i) => (
          <line key={i} x1={pad.l} y1={y} x2={w - pad.r} y2={y}
            stroke={C.grid} strokeWidth={0.8} strokeDasharray="3 5" />
        ))}

        {/* Min–Max-Band ganz nach hinten: es ist die weiteste Fläche und würde
            alles andere verdecken, läge es weiter vorn. */}
        {showRange && rangePath && (
          <g clipPath="url(#vwPriceClip)">
            <path d={rangePath} fill={SERIES_COLOR.range} opacity="0.10" />
          </g>
        )}

        {/* Donchian-Kanal - hinter allem anderen */}
        {showDonchian && donchPath && (
          <g clipPath="url(#vwPriceClip)">
            <path d={donchPath} fill={C.gold} opacity="0.07" />
            <path d={line(p => p.donch_top)} fill="none" stroke={C.gold} strokeWidth="1"
              strokeDasharray="4 3" opacity="0.45" />
            <path d={line(p => p.donch_bot)} fill="none" stroke={C.gold} strokeWidth="1"
              strokeDasharray="4 3" opacity="0.45" />
          </g>
        )}

        {/* Preis-Serien im Clip-Bereich: ein gekappter Ausreißer darf nicht
            über die Achsen hinausmalen */}
        <g clipPath="url(#vwPriceClip)">
        {showCandles && data.map((p, i) => {
          if (p.open_price == null || p.closed_price == null) return null;
          const o = p.open_price, cl = p.closed_price;
          const rising = cl >= o;
          const cc = rising ? C.up : C.down;
          const x  = toX(p.ms);
          const yO = toY(o), yC = toY(cl);
          const bodyTop = Math.min(yO, yC);
          const bodyH   = Math.max(Math.abs(yC - yO), 1);
          return (
            <g key={i} opacity={hover === i ? 1 : 0.85}>
              {p.min_price != null && p.max_price != null && (
                <line x1={x} y1={toY(p.max_price)} x2={x} y2={toY(p.min_price)}
                  stroke={cc} strokeWidth="1" opacity="0.7" />
              )}
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
                fill={rising ? `${cc}55` : cc} stroke={cc} strokeWidth="1" />
            </g>
          );
        })}

        {/* Fläche + Ø-Linie */}
        {!showCandles && (
          <path d={`${avgPath} L${toX(t1).toFixed(1)},${pad.t + priceH} L${toX(t0).toFixed(1)},${pad.t + priceH} Z`}
            fill="url(#vwAvgFill)" />
        )}
        <path d={avgPath} fill="none" stroke={col} strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round" opacity={showCandles ? 0.75 : 1} />

        {/* Median und gleitender Durchschnitt ÜBER der Ø-Linie, aber dünner:
            sie ergänzen den Verlauf, sie ersetzen ihn nicht. */}
        {showMedian && (
          <path d={line(p => p.median)} fill="none" stroke={SERIES_COLOR.median}
            strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        )}
        {showMovingAvg && (
          <path d={line(p => p.moving_avg)} fill="none" stroke={SERIES_COLOR.movingAvg}
            strokeWidth="1.3" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
        )}

        {showDots && data.map((p, i) => (
          <circle key={i} cx={toX(p.ms)} cy={toY(p.avg_price!)} r={hover === i ? 3.5 : 2.4}
            fill={hover === i ? C.t : col} />
        ))}
        {!showDots && (
          <circle cx={toX(t1)} cy={toY(last)} r="3.5" fill={col} />
        )}
        </g>

        {/* Volumen-Panel */}
        {data.map((p, i) => {
          const v = p.volume ?? 0;
          const bh = (v / maxVol) * volH;
          return (
            <rect key={i} x={toX(p.ms) - bodyW / 2} y={volTop + (volH - bh)}
              width={bodyW} height={Math.max(bh, v > 0 ? 1 : 0)}
              fill={C.cy} opacity={hover === i ? 0.7 : 0.3} />
          );
        })}
        {/* Grundlinie der Balken - die Null-Referenz, deshalb durchgezogen: das
            unterscheidet sie vom gepunkteten Raster. Die frühere zweite Linie an
            der Oberkante des Volumenpanels ist entfallen, sie lag bei effektiv
            0,09 Deckkraft und trug keine Information. */}
        <line x1={pad.l} y1={volTop + volH} x2={w - pad.r} y2={volTop + volH} stroke={C.axis} strokeWidth="1" />

        {/* Achsenbeschriftung - Werte in voller Textfarbe, damit sie sich vom
            Gitter abheben; Einheit als Platin-Icon statt "Plat". */}
        {yTicks.map(({ y, label }, i) => (
          <g key={i}>
            <text x={w - pad.r + 8} y={y + 4} fontSize="13" fill={C.t} fontFamily="monospace">
              {label}
            </text>
            <image href={PlatinumSmall} x={w - pad.r + 12 + label.length * 7.2} y={y - 5}
              width="11" height="11" />
          </g>
        ))}

        {/* Achsentitel */}
        <text x={w - pad.r + 8} y={pad.t - 3} fontSize="12" fill={C.t2}
          fontWeight="600" letterSpacing="0.1em">{t("PRICE")}</text>
        <text x={w - pad.r + 8} y={volTop + 10} fontSize="12" fill={C.t2}
          fontWeight="600" letterSpacing="0.1em">{t("TRADES")}</text>

        <text x={w - pad.r + 8} y={H - 7} fontSize="12" fill={C.t2}
          fontWeight="600" letterSpacing="0.1em">{t("PERIOD")}</text>

        {xTicks.map(({ x, label }, i, arr) => (
          <text key={i} x={x} y={H - 7} fontSize="13" fill={C.t} fontFamily="monospace"
            textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}>
            {label}
          </text>
        ))}

        {/* Crosshair über beide Panels */}
        {hp && (
          <line x1={toX(hp.ms)} y1={pad.t} x2={toX(hp.ms)} y2={volTop + volH}
            stroke={C.gold} strokeWidth="0.8" strokeDasharray="3 3" opacity="0.75" />
        )}
      </svg>

      {/* Tooltip */}
      {hp && (
        <div style={{
          position: "absolute", top: 6, pointerEvents: "none",
          left: Math.min(Math.max(toX(hp.ms) + 12, 0), Math.max(w - 210, 0)),
          background: "rgba(10,12,28,0.97)", border: `1px solid ${C.b2}`,
          borderRadius: C.rad, padding: "8px 11px", minWidth: 180,
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)", backdropFilter: "blur(10px)",
        }}>
          <div style={{ fontSize: 12, color: C.t2, marginBottom: 6, fontFamily: "monospace" }}>
            {fmtFull(hp.ms, resolution)}
          </div>
          <div style={{ ...T.num, color: C.gold, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            {num(hp.avg_price, 0)}
            <img src={PlatinumSmall} width={12} height={12} alt={t("Platinum")} />
          </div>
          {([
            // Min–Max steht immer, auch ohne eingeschaltetes Band: die Spanne
            // eines Buckets ist die Grundinformation zum Punkt unter dem Cursor.
            [t("Min–Max"),  `${num(hp.min_price, 0)} – ${num(hp.max_price, 0)}`,
             showRange ? SERIES_COLOR.range : C.t2],
            showMedian && hp.median != null
              ? [t("Median"), num(hp.median, 0), SERIES_COLOR.median] : null,
            showMovingAvg && hp.moving_avg != null
              ? [t("Moving average"), num(hp.moving_avg, 0), SERIES_COLOR.movingAvg] : null,
            showDonchian && hp.donch_top != null
              ? [t("Donchian"), `${num(hp.donch_bot, 0)} – ${num(hp.donch_top, 0)}`, C.gold] : null,
            showCandles && hp.open_price != null
              ? [t("Open→Close"), `${num(hp.open_price, 0)} → ${num(hp.closed_price, 0)}`,
                 (hp.closed_price ?? 0) >= (hp.open_price ?? 0) ? C.up : C.down] : null,
            [t("Trades"), String(hp.volume ?? 0), C.cy],
          ].filter(Boolean) as [string, string, string][]).map(([label, value, color]) => (
            <div key={label} style={{
              display: "flex", justifyContent: "space-between", gap: 14,
              fontSize: 13, fontFamily: "monospace", marginTop: 3,
            }}>
              <span style={{ color: C.t2 }}>{label}</span>
              <span style={{ color, fontWeight: 600 }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Legende außerhalb der beobachteten Plotfläche - sie darf umbrechen,
        ohne die Höhenmessung zu beeinflussen. */}
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "10px 4px 2px", flexShrink: 0 }}>
      {SERIES.map(s => (
        <LegendToggle key={s.key} def={s}
          active={enabled[s.key]} disabled={!available[s.key]}
          onClick={() => toggle(s.key)} />
      ))}
      {clipped && (
        <span style={{ ...T.meta, fontSize: 12, marginLeft: 4, display: "inline-flex", alignItems: "center", gap: 3 }}
          title={t("A single outlier would flatten the whole chart - the scale is capped for that reason.")}>
          · Skala gekappt, Ausreißer bis {num(trueMax, 0)}
          <img src={PlatinumSmall} width={11} height={11} alt={t("Platinum")} />
        </span>
      )}
    </div>
    </div>
  );
};
