import { useState, useEffect, useCallback, useMemo } from "react";
import { ExternalLinkIcon, SmallPlatIcon, TradeIcon, TrendDownIcon, TrendUpIcon, ValueIcon } from "./Icons";
import { ItemChart } from "./ItemChart";
import { C, HOURS_PHRASE, SlideToggle, T, TextLink, hoverSurface, marketUrl, plat, pctChange } from "./shared";
import { A, itemPath } from "../router";
import { itemName, locale, t, useI18n } from "../i18n";
import { oneOf, usePersistentState } from "../prefs";
import type { HistoryResponse, TopItem } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiResponse {
  last_updated: string;
  top_performer: TopItem[];
  top_loser:     TopItem[];   // echte Verlierer, seit /api/top sie separat liefert
  top_seller:    TopItem[];
  top_traded:    TopItem[];
}



export type ChangeMetric = "pct" | "abs";

/**
 * Veränderung in der gewählten Einheit. Prozent bei günstigen Items ist
 * strukturell irreführend (0,22 → 0,67 ₱ sind +203 %, aber 0,45 Platin),
 * deshalb die Platin-Differenz als gleichwertige Alternative.
 */
const formatChange = (item: TopItem, metric: ChangeMetric): string => {
  if (metric === "abs") {
    const v = item.change_abs;
    if (v == null) return "—";
    // Nicht plat(): das hebt jeden Wert auf mindestens 1 an und machte aus
    // −0,01 ₱ ein „−1". Unter einem halben Platin steht schlicht „0".
    const r = Math.round(v);
    if (r === 0) return "0";
    return `${r > 0 ? "+" : "−"}${Math.abs(r)}`;
  }
  return pctChange(item.change_pct);
};

/**
 * Farbe zur angezeigten Veränderung. Neutral, sobald der ANGEZEIGTE Wert null
 * ist — im Platin-Modus rundet alles unter einem halben Platin auf „0", und ein
 * rotes „0 ₱ über 24H" behauptet einen Rückgang, den die Zahl nicht zeigt.
 */
const changeColor = (item: TopItem, metric: ChangeMetric): string => {
  const v = metric === "abs"
    ? (item.change_abs == null ? null : Math.round(item.change_abs))
    : item.change_pct;
  if (v == null || v === 0) return C.t2;
  return v > 0 ? C.up : C.down;
};

/**
 * Angezeigter Preis eines Items: der letzte Punkt der Zeitreihe, nicht das Mittel
 * über den Zeitraum. Sonst widerspricht die Zeile sich selbst — „998 (+524)" bei
 * einem Verlauf von 501 auf 1025 ließ sich nicht zusammenrechnen, weil die 998 das
 * Fenstermittel waren und die 524 die Differenz der Ränder.
 * Fallback auf avg_price, falls die API das Feld (noch) nicht liefert.
 */
const price = (item: TopItem): number | null | undefined =>
  item.current_price ?? item.avg_price;

/** Veränderung samt Einheit — im Platin-Modus mit Platin-Zeichen. */
const ChangeValue = ({ item, metric }: { item: TopItem; metric: ChangeMetric }) => (
  <>{formatChange(item, metric)}{metric === "abs" && item.change_abs != null && <SmallPlatIcon />}</>
);

/**
 * Volumen-Entwicklung: erster gegen letzten Balken des Volumen-Graphen. Bei
 * „Meistgehandelt" ersetzt sie die Preisveränderung, denn dort ist die
 * Handelsaktivität die Messgröße.
 *
 * Folgt dem Einheiten-Umschalter wie die Preisansichten — vorher stand hier
 * beides gleichzeitig („+14 (+1400 %)"), was die Zeile überlud und dem Schalter
 * in dieser Ansicht jede Wirkung nahm. „Absolut" heißt hier Anzahl Trades, nicht
 * Platin; der Umschalter zeigt deshalb „#" statt des Platin-Icons.
 *
 * Ab 100 % ohne Nachkommastelle: „+1400,0 %" täuscht eine Genauigkeit vor, die
 * ein Vergleich zweier Tageszahlen nicht hat.
 */
const formatVolumeChange = (item: TopItem, metric: ChangeMetric): string => {
  if (metric === "pct") {
    const p = item.volume_change_pct;
    if (p == null) return "—";
    const ps = Math.abs(p) >= 100 ? Math.round(Math.abs(p)).toLocaleString(locale()) : Math.abs(p).toFixed(1);
    return `${p >= 0 ? "+" : "−"}${ps} %`;
  }
  const v = item.volume_change_abs;
  if (v == null) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toLocaleString(locale())}`;
};

const volumeChangeColor = (item: TopItem): string => {
  const v = item.volume_change_abs;
  if (v == null || v === 0) return C.t2;
  return v > 0 ? C.up : C.down;
};

interface DashboardPageProps {
  data:   ApiResponse | null;
  hours:  number;
  metric: ChangeMetric;
  onMetricChange: (m: ChangeMetric) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────



// ─── Item Icon ────────────────────────────────────────────────────────────────
// Uses thumb_path from API if available, falls back to initials placeholder.

const ItemIcon = ({ item, size = 30 }: { item: TopItem; size?: number }) => {
  const [failed, setFailed] = useState(false);

  if (item.thumb_path && !failed) {
    return (
      <img
        src={item.thumb_path}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        style={{
          borderRadius: 2, flexShrink: 0,
          objectFit: "contain", display: "block",
        }}
      />
    );
  }

  // Fallback: initials
  const initials = item.item_name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: 2, flexShrink: 0,
      background: "rgba(200,168,75,0.12)", border: `1px solid ${C.b}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, color: C.gold, fontWeight: 700, letterSpacing: "-0.02em",
    }}>
      {initials}
    </div>
  );
};

// ─── Switcher Card ────────────────────────────────────────────────────────────

const SwitcherCard = ({
  label, value, sub, accentColor, valueColor, active, onClick,
}: {
  label: string; value: React.ReactNode; sub: React.ReactNode;
  accentColor: string; valueColor?: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    style={{
      background: active ? "rgba(10,12,40,0.95)" : C.card,
      border: `1px solid ${active ? C.b2 : C.b}`,
      borderRadius: 2, padding: "15px 18px", cursor: "pointer",
      transition: "border-color 0.15s, background 0.15s",
      position: "relative", overflow: "hidden", textAlign: "left",
      fontFamily: "system-ui, -apple-system, sans-serif", width: "100%",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = C.b2; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = C.b; }}
  >
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accentColor, opacity: active ? 1 : 0.5 }} />
    <div style={{ ...T.label, marginBottom: 7 }}>{label}</div>
    <div style={{ ...T.stat, color: valueColor ?? accentColor, marginBottom: 5 }}>{value}</div>
    <div style={{ ...T.meta, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
  </button>
);

// ─── List Item ────────────────────────────────────────────────────────────────

// Platzierung nach Warframes eigenen Stufen (Platin › Gold › Silber › Bronze,
// wie bei Mod- und Arcane-Seltenheiten).
//
// Die Werte sind so gewählt, dass die Helligkeit DURCHGEHEND fällt — sonst wirkt
// ein schlechterer Rang heller als ein besserer. Die erste Fassung hatte genau
// dieses Problem gleich doppelt: Silber (9,90:1) war heller als Gold (8,22:1),
// und Bronze (4,97:1) dunkler als die Ränge 4–10 (8,08:1).
//
// Kontrast gegen den Seitenhintergrund:
//   Platin 14,79 › Gold 8,22 › Silber 7,76 › Bronze 5,63
//
// Bronze liegt unter der Textregel aus shared.tsx (C.t2 = 8,08:1), aber über dem
// AA-Minimum von 4,5:1. Vertretbar, weil die Rangziffer redundant ist: die
// Position in der Liste nennt den Rang ohnehin.
const MEDAL = {
  platinum: "#dfe4ef",
  gold:     C.gold,
  silver:   "#9fa7b3",
  bronze:   "#bd7f42",
} as const;

const rankStyle = (rank: number): React.CSSProperties => {
  if (rank === 1) return { color: MEDAL.platinum, fontSize: 18 };
  if (rank === 2) return { color: MEDAL.gold,     fontSize: 16 };
  if (rank === 3) return { color: MEDAL.silver,   fontSize: 15 };
  return { color: MEDAL.bronze, fontSize: 13 };
};


const ListItem = ({ item, rank, active, metric, showVolumeChange, onClick }: {
  item: TopItem; rank: number; active: boolean; metric: ChangeMetric;
  showVolumeChange: boolean; onClick: () => void;
}) => {

  return (
    <div
      onClick={onClick}
      style={{
        padding: "12px 16px", borderBottom: `1px solid ${C.b}`,
        cursor: "pointer", transition: "background 0.1s",
        display: "flex", alignItems: "center", gap: 10,
        background: active ? "rgba(200,168,75,0.09)" : "transparent",
        borderLeft: active ? `2px solid ${C.gold}` : "2px solid transparent",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.hov; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(200,168,75,0.09)" : "transparent"; }}
    >
      <span style={{ ...T.numSmall, ...rankStyle(rank), minWidth: 20, textAlign: "center" }}>{rank}</span>
      <ItemIcon item={item} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Bewusst kein Link: die Liste wählt nur die Detailansicht aus.
            Zur Item-Seite geht es ausschließlich über Titel oder Bild im Detail. */}
        <div style={{ ...T.bodyStrong, color: active ? C.gold : C.t, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {itemName(item)}
        </div>
        <div style={{ ...T.meta, marginTop: 2 }}>
          {/* Mit Einheit statt „Vol 860": das Kürzel nennt nicht, was gezählt wird.
              Tausendertrennung wie an jeder anderen Volumen-Stelle der App.

              Bei „Meistgehandelt" stehen hier stattdessen die Platin — dort ist
              die Handelsaktivität die Leitgröße und gehört nach rechts, damit die
              Veränderung darunter sich auf sie bezieht und nicht auf den Preis. */}
          {item.max_rank != null && item.max_rank > 0 ? `R${item.max_rank} · ` : ""}
          {showVolumeChange
            ? <>{plat(price(item))}<SmallPlatIcon /></>
            : <>{item.volume.toLocaleString(locale())} {t("Trades")}</>}
          {/* Der angezeigte Wert bleibt immer der echte — hier steht nur, worauf
              er beruht. Schwelle 0,25 entspricht bei m = 30 rund zehn Trades.
              (Mit dem früheren m = 10 stand hier 0,5 für dieselben zehn Trades;
              unverändert übernommen hätte sie jetzt bei dreißig gegriffen.) */}
          {item.confidence != null && item.confidence < 0.25 && (
            <span title={t("Only %d trades — figure is not very reliable", item.volume)}
              style={{ color: C.t3, fontStyle: "italic" }}>
              {" · " + t("thin data")}
            </span>
          )}
        </div>
      </div>
      {/* Zweizeilig wie die linke Spalte: Preis oben, Veränderung darunter.
          Zuvor waren es zwei Layouts für dieselbe Sache — „Meistgehandelt" schon
          zweizeilig, alle anderen Ansichten einzeilig mit Klammerwert.

          Genau EIN Platin-Icon je Zeile. Zeile 2 ruft deshalb formatChange roh
          auf und nicht ChangeValue: die Komponente hängt im Platin-Modus ein
          zweites Icon an. Die Einheit steht in der Zeile darüber. */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {/* Leitgröße der Ansicht: bei „Meistgehandelt" die Trades in C.cy (die
            Akzentfarbe dieser Ansicht), sonst der Preis in Gold. Gold bleibt so
            durchgehend dem Platinwert vorbehalten — und es steht weiterhin genau
            EIN Platin-Icon je Zeile, hier nur links.

            Die Akzentfarbe trägt nur die Zahl, nicht die Einheit: „Trades" ist
            das Pendant zum Platin-Icon der anderen Ansichten und steht wie dieses
            zurück. Durchgehend eingefärbt zog das Wort mehr Aufmerksamkeit als
            die Zahl davor. */}
        <div style={{ ...T.num, color: showVolumeChange ? C.cy : C.gold, whiteSpace: "nowrap" }}>
          {showVolumeChange
            ? <>{item.volume.toLocaleString(locale())} <span style={{ color: C.t2 }}>{t("Trades")}</span></>
            : <>{plat(price(item))}<SmallPlatIcon /></>}
        </div>
        {showVolumeChange ? (
          <div style={{ ...T.numSmall, marginTop: 2, color: volumeChangeColor(item), whiteSpace: "nowrap" }}
            title={metric === "abs"
              ? t("Trades at the last against trades at the first point of the period")
              : t("Change in trades, last against first point of the period")}>
            {formatVolumeChange(item, metric)}
          </div>
        ) : (
          <div style={{ ...T.numSmall, marginTop: 2, color: changeColor(item, metric), whiteSpace: "nowrap" }}>
            {formatChange(item, metric)}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

// Kein eigener Zeitraum mehr: der Graph folgt dem Seiten-Selektor. Vorher liefen
// beide auseinander, wodurch die Kennzahlenzeile zwei verschiedene Zeiträume
// vermischte (Eröffnung aus dem Graph-Fenster, Veränderung aus dem Seiten-Fenster).
// Tiefe Historie mit eigenem Zeitraum gibt es weiterhin auf der Item-Seite.
const DetailPanel = ({ item, hours, metric }: { item: TopItem; hours: number; metric: ChangeMetric }) => {
  const [history, setHistory]     = useState<HistoryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(true);

  const changeCol = changeColor(item, metric);
  const pct = <ChangeValue item={item} metric={metric} />;

  useEffect(() => {
    if (!item.slug) { setHistory(null); setHistLoading(false); return; }
    let cancelled = false;
    setHistLoading(true);
    (async () => {
      try {
        const res  = await fetch(`/api/item/${encodeURIComponent(item.slug!)}/history?hours=${hours}`);
        const json = await res.json();
        if (!cancelled) setHistory(json);
      } catch { /* keep */ }
      finally { if (!cancelled) setHistLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [item.slug, hours]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

      {/* Head */}
      <div style={{
        padding: "18px 24px", borderBottom: `1px solid ${C.b}`,
        background: "rgba(0,0,0,0.15)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Bild führt wie der Titel auf die Item-Seite */}
          {item.slug ? (
            <A href={itemPath(item.slug)} style={{ display: "block", cursor: "pointer", flexShrink: 0 }}
              title={t("%s — open detail page", itemName(item))}>
              <ItemIcon item={item} size={52} />
            </A>
          ) : (
            <ItemIcon item={item} size={52} />
          )}
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.t, lineHeight: 1.15, display: "flex", alignItems: "center", gap: 10 }}>
              {item.slug
                ? <A href={itemPath(item.slug)}>{itemName(item)}</A>
                : <span>{itemName(item)}</span>}
              {item.max_rank != null && item.max_rank > 0 && (
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 2, border: `1px solid rgba(200,168,75,0.4)`, color: C.gold, background: "rgba(200,168,75,0.1)", fontWeight: 700 }}>
                  R{item.max_rank}
                </span>
              )}
            </div>
            {/* Stand der Daten stand hier vorher als Datum — das war MAX(ts), der
                jüngste Datenpunkt im Fenster, und nicht der Sync-Zeitpunkt, als
                den man es las. Die Angabe steht als „Last Update" im Seitenkopf.
                An dieser Stelle ist die Herkunft der Daten das Nützlichere. */}
            <div style={{ ...T.meta, marginTop: 2 }}>
              {item.slug && (
                <TextLink href={marketUrl(item.slug)} target="_blank" rel="noopener noreferrer"
                  title={t("View on warframe.market — opens a new tab")}>
                  warframe.market<ExternalLinkIcon />
                </TextLink>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {/* Als einziger Wert der Seite stand die Leitkennzahl bisher ohne Label
              da, während jede Kachel darunter eines trägt. „AKTUELLER PREIS" wie
              in der KPI-Leiste der Item-Seite — und trennscharf gegen
              „ERÖFFNUNG" in der Kachelzeile direkt darunter. */}
          <div style={{ ...T.label, marginBottom: 6 }}>{t("CURRENT PRICE")}</div>
          {/* Ohne Veränderungszeile: die stand hier wortgleich und in derselben
              Farbe wie die Kachel „PREISVERÄNDERUNG" zwei Zentimeter darunter. */}
          <div style={{ ...T.hero, color: C.gold }}>
            {plat(price(item))}<SmallPlatIcon />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.b}`, flexShrink: 0 }}>
        {([
          // Median statt Eröffnung: der Startwert des Fensters trug nichts bei,
          // den Ausgangspunkt zeigt die Kurve. Der Median dagegen sagt, was ein
          // Item üblicherweise kostet, und ist gegen Ausreißer unempfindlich —
          // bei Nutzerangaben ohne Trade-Zwang die belastbarere Größe.
          // „typischer Preis", nicht „Hälfte der Trades darunter": der Wert ist
          // ein volumengewichtetes Mittel der Bucket-Mediane (siehe _vw_avg in
          // api/db.py), kein Quantil über alle Einzeltrades.
          { label: t("MEDIAN"),          value: <>{plat(item.median)}<SmallPlatIcon /></>, sub: t("Typical price"), color: C.t2 },
          // Der Durchschnitt zieht als Unterzeile hierher. Die frühere Unterzeile
          // nannte die Differenz samt Prozentzahl (spread/avg) — eine Größe ohne
          // Namen, aus der sich nichts ablesen ließ: „111 %" bei 3–9 ₱.
          { label: t("PRICE RANGE"),     value: <>{plat(item.min_price)} – {plat(item.max_price)}<SmallPlatIcon /></>, sub: <>{t("Average price")} {plat(item.avg_price)}<SmallPlatIcon /></>, color: C.t },
          { label: t("TRADES"),          value: item.volume.toLocaleString(locale()), sub: t(HOURS_PHRASE[hours]), color: C.cy },
          // „Beginn des Zeitraums" statt „Eröffnung": die gleichnamige Kachel gibt
          // es nicht mehr, der Bezugspunkt ist jetzt der Start der Kurve.
          { label: t("PRICE CHANGE"), value: pct, sub: t("Since start of period"), color: changeCol },
        ] as { label: string; value: React.ReactNode; sub: React.ReactNode; color: string }[]).map((s, i, arr) => (
          <div key={s.label} style={{ flex: 1, padding: "13px 20px", borderRight: i < arr.length - 1 ? `1px solid ${C.b}` : "none" }}>
            <div style={{ ...T.label, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ ...T.meta, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Chart-Kopf — nur noch die Überschrift, ohne Unterkante und ohne eigene
          Tönung. Der Zusatz „48H · stündlich" ist entfallen: den Zeitraum nennen
          der ZEITRAUM-Umschalter, die Zeile unter dem Preis („über 48H") und die
          Kachel „PREISVERÄNDERUNG"; die Auflösung liest man an der Zeitachse ab.
          (Der Listenkopf zählte hier früher mit — dort steht der Zeitraum
          inzwischen ebenfalls nicht mehr.) */}
      <div style={{ padding: "14px 22px 0", flexShrink: 0 }}>
        <span style={{ fontSize: 12, letterSpacing: "0.12em", color: C.t2, fontWeight: 600 }}>
          {t("PRICE HISTORY")}
        </span>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0, padding: "6px 16px 8px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {histLoading && !history ? (
          <div style={{
            height: "100%", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.t2, fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em",
          }}>
            {t("LOADING…")}
          </div>
        ) : (
          <ItemChart points={history?.points ?? []} resolution={history?.resolution ?? "day"} minHeight={260} />
        )}
      </div>
    </div>
  );
};

// ─── DashboardPage ────────────────────────────────────────────────────────────

type ViewKey = "gainers" | "losers" | "traded" | "value";

const VIEW_CONFIG: Record<ViewKey, {
  label: string; title: string; accentColor: string; Icon: () => React.ReactElement;
}> = {
  // Beschriftungen sind Übersetzungsschlüssel (englischer Quelltext), übersetzt
  // wird beim Rendern über t().
  gainers: { label: "BIGGEST PRICE GAIN",  title: "Biggest price gain",  accentColor: C.up,   Icon: TrendUpIcon   },
  losers:  { label: "BIGGEST PRICE DROP",  title: "Biggest price drop",  accentColor: C.down, Icon: TrendDownIcon },
  traded:  { label: "MOST TRADED",         title: "Most traded",         accentColor: C.cy,   Icon: TradeIcon     },
  value:   { label: "MOST EXPENSIVE ITEM", title: "Most expensive item", accentColor: C.gold, Icon: ValueIcon     },
};

const VIEW_ORDER: ViewKey[] = ["gainers", "losers", "traded", "value"];

const isView = oneOf<ViewKey>(VIEW_ORDER);

/**
 * Ansichtsumschalter im Listenkopf. Steuert denselben view-State wie die großen
 * Karten darüber — kein zweiter Zustand, beide Richtungen bleiben automatisch
 * synchron. Ersetzt die frühere Zierlinie, die keine Information trug.
 */
const ViewIconSwitch = ({
  view, onChange, loserTitle,
}: {
  view: ViewKey; onChange: (v: ViewKey) => void; loserTitle: string;
}) => (
  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
    {VIEW_ORDER.map(key => {
      const cfg    = VIEW_CONFIG[key];
      const active = view === key;
      const title  = t(key === "losers" ? loserTitle : cfg.title);
      return (
        <button key={key} onClick={() => onChange(key)}
          title={title} aria-label={title} aria-pressed={active}
          {...hoverSurface({ active, border: true, restBorder: "transparent" })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 30, padding: 0, borderRadius: C.radBtn,
            border: `1px solid ${active ? `${cfg.accentColor}88` : "transparent"}`,
            background: active ? `${cfg.accentColor}18` : "transparent",
            color: active ? cfg.accentColor : C.t2,
            cursor: "pointer", transition: "all 0.12s",
          }}>
          <cfg.Icon />
        </button>
      );
    })}
  </div>
);

/**
 * Einheit der Veränderung. Prozent zeigt relative Bewegung, Platin die
 * tatsächliche Differenz — bei günstigen Items laufen die beiden weit
 * auseinander (+203 % sind dort keine halbe Platin). Nur bei den beiden
 * Veränderungs-Ansichten sichtbar, sonst hätte der Schalter keine Wirkung.
 */
const MetricToggle = ({ metric, view, onChange }: {
  metric: ChangeMetric; view: ViewKey; onChange: (m: ChangeMetric) => void;
}) => {
  // Die absolute Seite zeigt die Einheit, auf die sie umstellt. Bei
  // „Meistgehandelt" sind das Trades, nicht Platin — ein Platin-Icon wäre dort
  // schlicht falsch.
  const absIsTrades = view === "traded";
  return (
    <SlideToggle<ChangeMetric>
      ariaLabel={t("Unit of change")}
      value={metric}
      onChange={onChange}
      options={[
        { key: "pct", label: <span style={{ fontSize: 14, fontWeight: 700 }}>%</span>,
          title: t("Change in percent") },
        { key: "abs",
          label: absIsTrades
            ? <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>#</span>
            : <span style={{ display: "inline-flex" }}><SmallPlatIcon /></span>,
          title: absIsTrades ? t("Number of trades") : t("Change in platinum") },
      ]}
    />
  );
};

// /api/top liefert echte Verlierer inzwischen als eigene Liste (top_loser, nach
// volumengewichtetem Verlust sortiert). Nur falls die leer ist — kein einziges Item
// im Minus — fällt die Karte auf den schwächsten Anstieg zurück und benennt sich
// entsprechend, statt einen Preisrückgang zu behaupten, den es nicht gibt.
const loserLabels = (v?: number | null) =>
  (v ?? 0) < 0
    ? { label: "BIGGEST PRICE DROP", title: "Biggest price drop" }
    : { label: "WEAKEST GAIN",       title: "Weakest gain"       };

export const DashboardPage = ({ data, hours, metric, onMetricChange }: DashboardPageProps) => {
  // Am Sprach-Context hängen, damit ein Umschalten sofort durchschlägt: t()
  // liest die Sprache aus einer Modulvariablen und löst von sich aus kein
  // Neuzeichnen aus.
  useI18n();
  // Vorgabe „Meistgehandelt": Handelsaktivität beschreibt den Markt, ohne von
  // einem einzelnen Ausschlag abzuhängen. Die Wahl überdauert das Neuladen.
  const [view, setView]               = usePersistentState<ViewKey>("vw:view", "traded", isView);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const getItems = useCallback((v: ViewKey): TopItem[] => {
    if (!data) return [];
    switch (v) {
      // Reihenfolge kommt unverändert von /api/top: dort wird nach
      // Veränderung × Glaubwürdigkeit sortiert. Eine clientseitige
      // Nachsortierung nach rohem Prozentwert hatte die Gewichtung zuvor
      // wirkungslos gemacht — ein Ausschlag mit 8 Trades stand vor einem
      // mit 42.
      case "gainers": return data.top_performer ?? [];
      // Fallback auf den schwächsten Anstieg, falls kein einziges Item im Minus
      // steht — dann heißt die Karte auch so (siehe loserLabels).
      case "losers":  return (data.top_loser ?? []).length
        ? data.top_loser
        : [...(data.top_performer ?? [])].reverse();
      case "traded":  return data.top_traded ?? [];
      case "value":   return data.top_seller ?? [];
    }
  }, [data]);

  const items = useMemo(() => getItems(view), [getItems, view]);
  const selectedItem = items[selectedIdx] ?? null;
  useEffect(() => { setSelectedIdx(0); }, [view]);

  // Karten zeigen jeweils den ersten Eintrag der GLEICH sortierten Liste,
  // damit Karte und Listenkopf nie auseinanderlaufen.
  const topGainer  = getItems("gainers")[0];
  const topLoser   = getItems("losers")[0];
  const topTraded  = (data?.top_traded ?? [])[0];
  const topValue   = (data?.top_seller ?? [])[0];

  const switchers: { key: ViewKey; value: React.ReactNode; sub: React.ReactNode; valueColor?: string }[] = [
    { key: "gainers", value: topGainer ? <ChangeValue item={topGainer} metric={metric} /> : "—", sub: topGainer ? <>{topGainer.item_name} · {plat(price(topGainer))}<SmallPlatIcon /></> : "Keine Daten", valueColor: topGainer && changeColor(topGainer, metric) === C.t2 ? C.t2 : undefined },
    { key: "losers",  value: topLoser ? <ChangeValue item={topLoser} metric={metric} /> : "—",  sub: topLoser  ? <>{topLoser.item_name} · {plat(price(topLoser))}<SmallPlatIcon /></>   : "Keine Daten", valueColor: topLoser && changeColor(topLoser, metric) === C.t2 ? C.t2 : undefined },
    { key: "traded",  value: topTraded ? topTraded.volume.toLocaleString(locale()) : "—", sub: topTraded ? <>{topTraded.item_name} · {plat(price(topTraded))}<SmallPlatIcon /></> : "Keine Daten" },
    { key: "value",   value: topValue  ? <>{plat(price(topValue))}<SmallPlatIcon /></> : "—", sub: topValue ? itemName(topValue) : t("No data") },
  ];

  return (
    <>
      {/* Switcher cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        {switchers.map(s => {
          const cfg = s.key === "losers"
            ? { ...VIEW_CONFIG.losers, ...loserLabels(topLoser?.change_pct) }
            : VIEW_CONFIG[s.key];
          return (
            <SwitcherCard key={s.key} label={t(cfg.label)} accentColor={cfg.accentColor}
              value={s.value} sub={s.sub} valueColor={s.valueColor} active={view === s.key} onClick={() => setView(s.key)} />
          );
        })}
      </div>

      {/* Master-Detail 38.2 / 61.8 */}
      <div style={{
        display: "flex", border: `1px solid ${C.b}`, borderRadius: 2,
        overflow: "hidden", background: C.card, backdropFilter: "blur(12px)",
        marginBottom: 22, minHeight: 520,
      }}>
        {/* List panel */}
        <div style={{ width: "38.2%", borderRight: `1px solid ${C.b}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${C.b}`, background: "rgba(0,0,0,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, overflow: "hidden" }}>
              <span style={{ ...T.cardTitle, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {view === "losers"
                  ? loserLabels(topLoser?.change_pct).title
                  : VIEW_CONFIG[view].title}
              </span>
              </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {/* Ohne Ansichtsbedingung: der Schalter wirkt jetzt in allen vier
                  Ansichten — bei „Meistgehandelt" zwischen Prozent und Anzahl
                  Trades, sonst zwischen Prozent und Platin. */}
              <MetricToggle metric={metric} view={view} onChange={onMetricChange} />
              <span style={{ width: 1, height: 18, background: C.b }} />
              <ViewIconSwitch view={view} onChange={setView}
                loserTitle={loserLabels(topLoser?.change_pct).title} />
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", ...T.meta, fontStyle: "italic" }}>Keine Daten verfügbar</div>
          ) : (
            items.map((item, i) => (
              <ListItem key={item.item_name + i} item={item} rank={i + 1} active={i === selectedIdx}
                metric={metric} showVolumeChange={view === "traded"} onClick={() => setSelectedIdx(i)} />
            ))
          )}
        </div>

        {/* Detail panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {selectedItem
            ? <DetailPanel key={selectedItem.item_name} item={selectedItem} hours={hours} metric={metric} />
            : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", ...T.meta, fontStyle: "italic" }}>{t("Select an item")}</div>
          }
        </div>
      </div>

    </>
  );
};