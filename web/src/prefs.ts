import { useCallback, useState } from "react";

// ─── Anzeigeeinstellungen (localStorage) ──────────────────────────────────────
//
// Vorher stand jeder Schlüssel mit eigenem Lader und Speicherer in der
// Komponente, die ihn brauchte — drei Schlüssel, drei Idiome: roher String bei
// vw:change-metric, JSON über Defaults gemerged bei vw:chart-series, JSON-Liste
// mit Deckel und Dedupe bei vw:recent-items. Jeder weitere Schlüssel hätte das
// Muster weiter zersplittert.
//
// Zwei Punkte, die nicht offensichtlich sind:
//
// 1. `accept` ist Pflicht, kein optionaler Cast. Im localStorage steht, was der
//    Nutzer hineinschreibt — ein Wert aus einer früheren Version, ein Tippfehler
//    aus der Konsole. Ohne Prüfung ließe sich vw:hours auf 999 setzen, was
//    /api/top mit 422 ablehnt und das Dashboard leer zurücklässt.
//
// 2. Gelesen wird JSON, aber ein Rohwert ist erlaubt. vw:change-metric liegt bei
//    bestehenden Nutzern als nacktes `abs` im Speicher, nicht als `"abs"` — ohne
//    diesen Rückfall verlöre jeder von ihnen die Einstellung beim ersten Aufruf
//    nach dem Deploy.

export const readPref = <T,>(key: string, fallback: T, accept: (v: unknown) => v is T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;   // Altbestand: vor der Vereinheitlichung roh gespeichert
    }
    return accept(parsed) ? parsed : fallback;
  } catch {
    return fallback;  // Privatmodus, Speicher abgeschaltet
  }
};

export const writePref = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Quota oder Privatmodus — folgenlos, die Ansicht funktioniert weiter */ }
};

/**
 * useState mit Gedächtnis. Der Setter schreibt selbst, damit das Speichern nicht
 * am Aufrufort von Hand mitgeführt werden muss — genau dort ging es vorher
 * verloren, sobald ein zweiter Aufrufer dazukam.
 *
 * Der Lazy Initializer ist wichtig: ohne ihn läuft der localStorage-Zugriff bei
 * jedem Render statt einmal beim Mount.
 */
export function usePersistentState<T>(
  key: string, fallback: T, accept: (v: unknown) => v is T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback, accept));
  const set = useCallback((v: T) => {
    writePref(key, v);
    setValue(v);
  }, [key]);
  return [value, set];
}

/** Type-Guard aus einer festen Werteliste — deckt die meisten Fälle hier ab. */
export const oneOf = <T,>(allowed: readonly T[]) =>
  (v: unknown): v is T => allowed.includes(v as T);
