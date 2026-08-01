import { useEffect, useRef, useState } from "react";
import { SmallPlatIcon } from "./Icons";
import { C, CategoryBadge, ItemThumb, T, plat } from "./shared";
import { A, itemPath, navigate } from "../router";
import { readPref, writePref } from "../prefs";
import { itemName, locale, t, useI18n } from "../i18n";
import type { SearchResult } from "../types";

// ─── Recently Searched (localStorage) ─────────────────────────────────────────

const RECENT_KEY = "vw:recent-items";
const RECENT_MAX = 6;

// Kein usePersistentState: die Liste wird auch außerhalb des Renders fortgeschrieben
// (Deckel und Dedupe in pushRecent). Lesen und Schreiben laufen trotzdem über
// dieselben Helfer wie alle übrigen Einstellungen.
const isResultList = (v: unknown): v is SearchResult[] => Array.isArray(v);

const loadRecent = (): SearchResult[] =>
  readPref<SearchResult[]>(RECENT_KEY, [], isResultList).slice(0, RECENT_MAX);

const pushRecent = (item: SearchResult): SearchResult[] => {
  const next = [item, ...loadRecent().filter(r => r.slug !== item.slug)].slice(0, RECENT_MAX);
  writePref(RECENT_KEY, next);
  return next;
};

// ─── Kategorie aus Tags ───────────────────────────────────────────────────────
// Frontend-Variante von classify_item_by_tags (api/db.py). Angezeigt wird nur die
// Oberkategorie, nicht die Misc-Unterkategorie - in der engen Zeile ist „Misc"
// die Angabe, die trägt; die Detailseite zeigt beide Badges vom Server.
//
// Die REIHENFOLGE ist die Klassifikation: Items tragen mehrere Tags, und der
// erste Treffer gewinnt. „Thermite Rounds" hat mod + primary - Mods steht vor
// Waffen, sonst stünde dort „Waffen".
//
// Vorher endete die Kette nach „set/prime" und alles darunter blieb ohne Badge:
// Scenes, Fische, Ressourcen, Ayatan, Skins, Schlüssel - „The Teacher Dojo Scene"
// (Tag `scene`) zeigte deshalb nichts, obwohl der Server sie als Misc/Scenes führt.

const MISC_TAGS = [
  "fish", "arcane_helmet", "skin", "scene", "simulacrum",
  "gem", "resource", "metal", "plant", "ayatan_sculpture", "ayatan_star",
  "focus", "lens", "kubrow", "pet", "imprint", "key", "beacon", "syndicate",
  "sentinel", "misc", "blueprint", "component", "collectible", "fusion core",
];

// Rückgabe sind die Kanonwerte aus classify_item_by_tags (englisch), NICHT
// Anzeigetexte - CategoryBadge übersetzt sie.
const categoryFromTags = (tags?: string[] | null): string | null => {
  const set = new Set((tags ?? []).map(x => x.toLowerCase()));
  if (set.has("arcane_enhancement")) return "Arcanes";
  if (set.has("relic"))              return "Relics";
  if (set.has("mod") || set.has("augment")) return "Mods";
  if (set.has("necramech") || set.has("mech")) return "Misc";
  if (set.has("warframe"))           return "Warframes";
  if (["primary", "secondary", "melee", "weapon", "sentinel_weapon", "archwing"].some(x => set.has(x))) return "Weapons";
  if (set.has("set") || set.has("prime")) return "Warframes";
  if (MISC_TAGS.some(x => set.has(x))) return "Misc";
  // Serverseitig heißt dieser Fall „Unsorted". Ein Badge dafür benennt nichts -
  // die Zeile bleibt wie bisher ohne.
  return null;
};

// ─── Herkunft des Preises ─────────────────────────────────────────────────────
// Drei Quellen, absteigend nach Aussagekraft: 48h-Handel → letzter Handelstag →
// niedrigstes Verkaufsangebot. Nur die erste braucht keine Erklärung.

const priceHint = (item: SearchResult): string | undefined => {
  if (item.is_offer) return t("Lowest sell offer - no trades in the last 48 hours");
  if (item.price_day) {
    const d = new Date(`${item.price_day}T00:00:00`);
    return t("Last traded on %s - no trades in the last 48 hours", d.toLocaleDateString(locale()));
  }
  return undefined;
};

// ─── Ergebniszeile ────────────────────────────────────────────────────────────

const ResultRow = ({
  item, active, onPick, onHover,
}: {
  item: SearchResult; active: boolean; onPick: () => void; onHover: () => void;
}) => {
  const cat = categoryFromTags(item.tags);
  return (
    <A
      href={itemPath(item.slug)}
      onClick={onPick}
      onMouseEnter={onHover}
      style={{
        display: "flex", alignItems: "center", gap: 9,
        padding: "7px 10px", borderRadius: C.radBtn,
        background: active ? C.hov : "transparent",
        transition: "background 0.1s",
      }}
    >
      <ItemThumb path={item.thumb_path} name={item.name} size={24} />
      <span style={{
        ...T.bodyStrong, flex: 1, minWidth: 0,
        color: active ? C.gold : C.t,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {itemName(item)}
      </span>
      {cat && <CategoryBadge cat={cat} />}
      {/* Ersatzpreise sehen aus wie frische Handelspreise - bewusst so
          entschieden. Der Unterschied steht nur im Tooltip, kostet also keine
          Breite in der ohnehin engen Zeile. */}
      {item.avg_price != null && (
        <span style={{ ...T.num, color: C.gold, flexShrink: 0 }}
          title={priceHint(item)}>
          {plat(item.avg_price)}<SmallPlatIcon />
        </span>
      )}
    </A>
  );
};

// ─── SearchBox ────────────────────────────────────────────────────────────────

export const SearchBox = () => {
  // Am Sprach-Context hängen, damit ein Umschalten sofort durchschlägt: t()
  // liest die Sprache aus einer Modulvariablen und löst von sich aus kein
  // Neuzeichnen aus.
  useI18n();
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent,  setRecent]  = useState<SearchResult[]>(loadRecent);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(-1);

  const boxRef   = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const term = query.trim();
  const showRecent = term.length < 2;
  const list       = showRecent ? recent : results;

  // Debounce + Abort, damit späte Antworten frühere nicht überschreiben
  useEffect(() => {
    if (term.length < 2) { setResults([]); setLoading(false); return; }

    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/item/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = await res.json();
        setResults(json.results ?? []);
      } catch { /* abgebrochen oder offline */ }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    }, 150);

    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [term]);

  useEffect(() => { setCursor(-1); }, [term]);

  // Click-outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (item: SearchResult) => {
    setRecent(pushRecent({
      name: item.name, slug: item.slug, thumb_path: item.thumb_path,
      // is_offer und price_day müssen mit: die Recently-Liste rendert dieselbe
      // Zeile und verlöre sonst den Hinweis, woher der Preis stammt.
      // Beide Namen mit: die Liste überlebt einen Sprachwechsel im Speicher.
      tags: item.tags, avg_price: item.avg_price, name_de: item.name_de,
      is_offer: item.is_offer, price_day: item.price_day,
    }));
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!list.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setCursor(c => (c + 1) % list.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setCursor(c => (c <= 0 ? list.length - 1 : c - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = list[cursor >= 0 ? cursor : 0];
      if (item) { pick(item); navigate(itemPath(item.slug)); }
    }
  };

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 12, letterSpacing: "0.12em", color: C.t2, fontWeight: 600,
      padding: "6px 10px 4px",
    }}>
      {text}
    </div>
  );

  return (
    <div ref={boxRef} style={{ flex: 1, maxWidth: 430, margin: "0 auto", position: "relative" }}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
        style={{ position: "absolute", left: 10, top: 15, transform: "translateY(-50%)", pointerEvents: "none", color: C.t2 }}>
        <circle cx="5" cy="5" r="4" stroke="currentColor" strokeWidth="1.2" />
        <line x1="8" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={t("Search item…")}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={e => { setOpen(true); e.currentTarget.style.borderColor = C.gold; }}
        onBlur={e => (e.currentTarget.style.borderColor = C.b)}
        onKeyDown={onKeyDown}
        style={{
          width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.b}`,
          borderRadius: C.rad, padding: "7px 12px 7px 32px", color: C.t,
          fontSize: 14, fontWeight: 500, outline: "none", transition: "border-color 0.15s",
        }}
      />

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "rgba(10,12,28,0.97)", border: `1px solid ${C.b2}`,
          borderRadius: C.rad, padding: 5, zIndex: 200,
          backdropFilter: "blur(14px)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxHeight: 420, overflowY: "auto",
        }}>
          {showRecent ? (
            recent.length > 0 ? (
              <>
                {sectionLabel(t("RECENTLY SEARCHED"))}
                {recent.map((r, i) => (
                  <ResultRow key={r.slug} item={r} active={i === cursor}
                    onPick={() => pick(r)} onHover={() => setCursor(i)} />
                ))}
              </>
            ) : (
              <div style={{ padding: "10px", ...T.meta, fontStyle: "italic" }}>
                {t("Type at least 2 characters…")}
              </div>
            )
          ) : loading && results.length === 0 ? (
            <div style={{
              padding: "14px 10px", textAlign: "center", color: C.t2,
              fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em",
            }}>
              {t("SEARCHING…")}
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "10px", ...T.meta, fontStyle: "italic" }}>
              {t("No matches for “%s”", term)}
            </div>
          ) : (
            results.map((r, i) => (
              <ResultRow key={r.slug} item={r} active={i === cursor}
                onPick={() => pick(r)} onHover={() => setCursor(i)} />
            ))
          )}
        </div>
      )}
    </div>
  );
};
