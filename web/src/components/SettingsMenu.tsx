import { useEffect, useRef, useState } from "react";
import { C, T, segBtn, segBtnHover } from "./shared";
import { t, useI18n } from "../i18n";
import type { Lang } from "../i18n";

/**
 * Zahnrad im Header: Oberflächensprache und Item-Namen getrennt einstellbar.
 *
 * Getrennt, weil beides verschiedene Zwecke hat - die Oberfläche liest man in
 * seiner Sprache, Items handelt man unter dem Namen, den der Handelschat und
 * warframe.market benutzen. Genau diese Kombination (Oberfläche deutsch,
 * Item-Namen englisch) ist deshalb die Vorgabe.
 */

const LANG_LABELS: Record<Lang, string> = { de: "Deutsch", en: "English" };

const Row = ({ label, value, onChange }: {
  label: string; value: Lang; onChange: (l: Lang) => void;
}) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
    <span style={{ ...T.meta, color: C.t, whiteSpace: "nowrap" }}>{label}</span>
    <div style={{ display: "flex", gap: 4 }}>
      {(["de", "en"] as const).map(l => {
        const active = value === l;
        return (
          <button key={l} onClick={() => onChange(l)} aria-pressed={active}
            style={{ ...segBtn(active), padding: "4px 10px" }} {...segBtnHover(active)}>
            {LANG_LABELS[l]}
          </button>
        );
      })}
    </div>
  </div>
);

export const SettingsMenu = () => {
  const { ui, items, setUi, setItems } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt - dasselbe Muster wie das Misc-Menü im Header.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t("Settings")} aria-label={t("Settings")} aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 30, height: 30, padding: 0, borderRadius: C.radBtn,
          border: `1px solid ${open ? C.b2 : "transparent"}`,
          background: open ? C.hov : "none",
          color: open ? C.gold : C.t2, cursor: "pointer", transition: "all 0.12s",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.color = C.t; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = C.t2; }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
          minWidth: 270, padding: "12px 14px",
          background: "rgba(10,12,28,0.97)", border: `1px solid ${C.b2}`,
          borderRadius: C.rad, backdropFilter: "blur(14px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ ...T.label, marginBottom: 2 }}>{t("LANGUAGE")}</div>
          <Row label={t("Interface")} value={ui} onChange={setUi} />
          <div style={{ height: 1, background: C.b }} />
          <Row label={t("Item names")} value={items} onChange={setItems} />
        </div>
      )}
    </div>
  );
};
