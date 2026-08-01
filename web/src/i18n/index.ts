import { createContext, useContext } from "react";
import { de } from "./de";

// ─── Übersetzung ──────────────────────────────────────────────────────────────
// Modell wie in ClashApp (/hdd1/clashapp/lang/translate.php): der **englische
// Quelltext ist der Schlüssel**, es gibt genau ein Wörterbuch je Fremdsprache,
// und fehlt ein Eintrag, steht der Schlüssel selbst da - also Englisch.
//
// Zwei Abweichungen vom Vorbild, beide bewusst:
//
// 1. Ein LEERER Eintrag gilt hier als fehlend und fällt auf Englisch zurück. In
//    PHP ist "" per isset() ein gültiger Wert und löscht den Text stillschweigend.
// 2. Kein Neuladen beim Sprachwechsel. Die Sprache hängt an einem Context, die
//    Oberfläche zeichnet sich neu.

export type Lang = "de" | "en";
export const LANGS: readonly Lang[] = ["de", "en"];

const DICTS: Record<Lang, Record<string, string>> = { de, en: {} };

// Die aktive Sprache liegt zusätzlich als Modulvariable, nicht nur im Context:
// `t()` wird auch aus reinen Hilfsfunktionen heraus aufgerufen (Zeitangaben,
// Tooltips), die keine Hooks nutzen dürfen. Der Provider hält beide Wege
// synchron - der Context löst das Neuzeichnen aus, die Variable liefert den Wert.
let activeUi: Lang = "de";
let activeItems: Lang = "en";

export const setActiveLangs = (ui: Lang, items: Lang) => {
  activeUi = ui;
  activeItems = items;
};

export const uiLang = () => activeUi;
export const itemLang = () => activeItems;

/**
 * Übersetzt und setzt Platzhalter ein - `%s` für Text, `%d` für Zahlen, in der
 * Reihenfolge der Argumente. Beispiel:
 *
 *     t("%d of %d Warframes", 2, 117)
 */
export const t = (key: string, ...args: (string | number)[]): string => {
  const hit = DICTS[activeUi][key];
  let out = hit && hit.length > 0 ? hit : key;
  if (args.length) {
    let i = 0;
    out = out.replace(/%[sd]/g, () => String(args[i++] ?? ""));
  }
  return out;
};

/**
 * Für Sätze mit eingebetteten Elementen (Links, farbige Wörter): gibt die Teile
 * um die `%s` herum zurück, der Aufrufer schiebt React-Knoten dazwischen.
 *
 *     const [a, b, c] = tParts("Base values from %s, growth from %s");
 *
 * Das PHP-Vorbild löst dasselbe, indem es `<a href=…>` und `</a>` als Argumente
 * in den Satz schiebt. Das ginge hier nur über dangerouslySetInnerHTML - die
 * Teile-Variante kommt ohne aus.
 */
export const tParts = (key: string): string[] => {
  const hit = DICTS[activeUi][key];
  return (hit && hit.length > 0 ? hit : key).split("%s");
};

// ─── Item-Namen ───────────────────────────────────────────────────────────────
// Zweite, getrennt einstellbare Sprache. Die API liefert IMMER beide Namen
// (siehe api/db.py), deshalb kostet das Umschalten keinen neuen Abruf.
//
// Die Felder heißen je nach Endpunkt `name`/`name_de` oder
// `item_name`/`item_name_de` - beide Formen werden hier abgefangen, damit die
// Aufrufer nicht wissen müssen, aus welcher Liste ihre Zeile stammt.

interface NamedRow {
  name?:          string | null;
  name_de?:       string | null;
  item_name?:     string | null;
  item_name_de?:  string | null;
}

export const itemName = (row: NamedRow | null | undefined): string => {
  if (!row) return "";
  const en = row.name ?? row.item_name ?? "";
  if (activeItems !== "de") return en;
  const dePart = row.name_de ?? row.item_name_de;
  return dePart && dePart.length > 0 ? dePart : en;
};

// ─── Zahlen, Datum, Sortierung ────────────────────────────────────────────────
// Folgen der OBERFLÄCHENsprache, nicht der Item-Sprache: „1.234,5" gegen
// „1,234.5" ist eine Eigenschaft des Fließtextes drumherum, nicht des Item-Namens.

export const locale = (): string => (activeUi === "de" ? "de-DE" : "en-US");

/** Dezimaltrennzeichen der aktiven Oberflächensprache. */
export const decimalSep = (): string => (activeUi === "de" ? "," : ".");

// ─── Context ──────────────────────────────────────────────────────────────────

export interface I18nValue {
  ui:       Lang;
  items:    Lang;
  setUi:    (l: Lang) => void;
  setItems: (l: Lang) => void;
}

export const I18nContext = createContext<I18nValue>({
  ui: "de", items: "en", setUi: () => {}, setItems: () => {},
});

/** Sprachwahl lesen und setzen. Löst beim Wechsel das Neuzeichnen aus. */
export const useI18n = () => useContext(I18nContext);

/**
 * Vorgabe für die Oberflächensprache: die Browsersprache, sonst Deutsch.
 *
 * Greift nur beim allerersten Besuch - sobald etwas im Speicher steht, gewinnt
 * die getroffene Wahl (readPref liefert dann den gespeicherten Wert).
 */
export const browserLang = (): Lang => {
  try {
    return navigator.language?.toLowerCase().startsWith("de") ? "de" : "en";
  } catch {
    return "de";
  }
};
