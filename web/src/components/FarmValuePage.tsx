import { useEffect, useState, useCallback } from "react";
import { SmallPlatIcon } from "./Icons";
import { C, CardCorner, TagFilter, VitFlourish, segBtn } from "./shared";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DropSource {
  source_type:    "relic" | "enemy";
  relic_name:     string | null;
  relic_quality:  string | null;
  droptable:      string | null;
  rarity:         string | null;
  chance_intact:  number | null;
  chance_radiant: number | null;
  chance_enemy:   number | null;
}

interface DropItem {
  item_name:          string;
  slug:               string;
  tags:               string;
  avg_price:          number;
  min_price:          number;
  max_price:          number;
  volume:             number;
  best_drop_chance_pct: number;
  value_per_drop:     number;
  drop_sources:       DropSource[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const REFINEMENTS = [
  { value: "intact",      label: "Intact" },
  { value: "exceptional", label: "Exceptional" },
  { value: "flawless",    label: "Flawless" },
  { value: "radiant",     label: "Radiant" },
  { value: "enemy",       label: "Enemy Drop" },
  { value: "best",        label: "Best" },
];

const SORT_OPTIONS = [
  { value: "drop_chance", label: "Drop Chance" },
  { value: "value",       label: "Wert (₱)" },
  { value: "ratio",       label: "Wert × Chance" },
];

const SOURCE_OPTIONS = [
  { value: "",      label: "Alle Quellen" },
  { value: "relic", label: "Nur Relics" },
  { value: "enemy", label: "Nur Enemies" },
];

const RARITY_COLORS: Record<string, string> = {
  COMMON:   C.t3,
  UNCOMMON: C.cy,
  RARE:     C.gold,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Drop Sources Popover (inline expanded row) ───────────────────────────────
const DropSourcesList = ({ sources }: { sources: DropSource[] }) => {
  const top = sources.slice(0, 5); // show max 5 sources inline
  return (
    <div style={{ paddingLeft: 14, paddingBottom: 8 }}>
      {top.map((src, i) => {
        const isRelic  = src.source_type === "relic";
        const chance   = isRelic ? src.chance_intact : src.chance_enemy;
        const rarColor = src.rarity ? (RARITY_COLORS[src.rarity] ?? C.t3) : C.t3;
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "4px 0", borderBottom: i < top.length - 1 ? `1px solid ${C.b}` : "none",
            fontSize: 11,
          }}>
            {/* Source type icon */}
            <span style={{
              fontFamily: "monospace", fontSize: 9, color: isRelic ? C.gold : C.cy,
              padding: "1px 5px", border: `1px solid ${isRelic ? C.gold : C.cy}44`,
              borderRadius: 2, letterSpacing: "0.1em", flexShrink: 0,
            }}>
              {isRelic ? "RELIC" : "ENEMY"}
            </span>

            {/* Name */}
            <span style={{ color: C.t2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {isRelic ? src.relic_name : src.droptable?.replace("DropTable", "").replace(/([A-Z])/g, " $1").trim()}
            </span>

            {/* Rarity */}
            {src.rarity && (
              <span style={{ fontFamily: "monospace", fontSize: 9, color: rarColor, flexShrink: 0 }}>
                {src.rarity}
              </span>
            )}

            {/* Chance */}
            <span style={{ fontFamily: "monospace", fontSize: 11, color: C.up, fontWeight: 700, flexShrink: 0, minWidth: 52, textAlign: "right" }}>
              {chance != null ? `${(chance * 100).toFixed(2)}%` : "—"}
            </span>
          </div>
        );
      })}
      {sources.length > 5 && (
        <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
          +{sources.length - 5} weitere Quellen
        </div>
      )}
    </div>
  );
};

// ─── FarmValuePage ────────────────────────────────────────────────────────────
export const FarmValuePage = () => {
  const [tag, setTag]               = useState<string | null>(null);
  const [refinement, setRefinement] = useState("intact");
  const [sortBy, setSortBy]         = useState("ratio");
  const [sourceType, setSourceType] = useState("");
  const [items, setItems]           = useState<DropItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const fetchDrops = useCallback(async () => {
    setLoading(true);
    setExpandedIdx(null);
    const params = new URLSearchParams({
      hours:      "48",
      limit:      "30",
      sort_by:    sortBy,
      refinement,
      min_volume: "3",
    });
    if (tag)        params.set("tag", tag);
    if (sourceType) params.set("source_type", sourceType);

    try {
      const res  = await fetch(`/api/market/drops?${params}`);
      const json = await res.json();
      setItems(json.items ?? []);
    } catch { /* keep */ }
    finally { setLoading(false); }
  }, [tag, refinement, sortBy, sourceType]);

  useEffect(() => { fetchDrops(); }, [fetchDrops]);

  // Column header for sort indicator
  const sortLabel = SORT_OPTIONS.find(s => s.value === sortBy)?.label ?? sortBy;
  const refLabel  = REFINEMENTS.find(r => r.value === refinement)?.label ?? refinement;

  return (
    <>
      {/* ── Filter controls ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
        padding: "14px 18px", marginBottom: 14, backdropFilter: "blur(10px)",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        {/* Row 1: Tag */}
        <TagFilter activeTag={tag} onChange={setTag} />

        {/* Divider */}
        <div style={{ height: 1, background: C.b }} />

        {/* Row 2: Refinement + Source + Sort */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.18em", marginRight: 4 }}>REFINEMENT</span>
            {REFINEMENTS.map(({ value, label }) => (
              <button key={value} onClick={() => setRefinement(value)} style={segBtn(refinement === value, C.gold)}
                onMouseEnter={e => { if (refinement !== value) e.currentTarget.style.color = C.t; }}
                onMouseLeave={e => { if (refinement !== value) e.currentTarget.style.color = C.t3; }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: C.b, flexShrink: 0 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.18em", marginRight: 4 }}>QUELLE</span>
            {SOURCE_OPTIONS.map(({ value, label }) => (
              <button key={value} onClick={() => setSourceType(value)} style={segBtn(sourceType === value, C.cy)}
                onMouseEnter={e => { if (sourceType !== value) e.currentTarget.style.color = C.t; }}
                onMouseLeave={e => { if (sourceType !== value) e.currentTarget.style.color = C.t3; }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: C.b, flexShrink: 0 }} />

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: C.t3, letterSpacing: "0.18em", marginRight: 4 }}>SORTIERUNG</span>
            {SORT_OPTIONS.map(({ value, label }) => (
              <button key={value} onClick={() => setSortBy(value)} style={segBtn(sortBy === value, C.up)}
                onMouseEnter={e => { if (sortBy !== value) e.currentTarget.style.color = C.t; }}
                onMouseLeave={e => { if (sortBy !== value) e.currentTarget.style.color = C.t3; }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Results table ── */}
      <div style={{
        background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
        overflow: "hidden", position: "relative", backdropFilter: "blur(10px)",
      }}>
        <CardCorner />
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
          background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 2, height: 15, borderRadius: 1, background: C.up, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t }}>Farm Value</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
                Sortiert nach {sortLabel} · Refinement: {refLabel}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: C.t3 }}>{items.length} Items</span>
            <VitFlourish />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 11 }}>
            LADEN...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: C.t3, fontSize: 13, fontStyle: "italic" }}>
            Keine Items mit Drop-Daten für diese Filterung
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.b}` }}>
                  {[
                    { label: "#",           right: false },
                    { label: "ITEM",        right: false },
                    { label: "PREIS (₱)",   right: true  },
                    { label: "DROP CHANCE", right: true  },
                    { label: "WERT/DROP",   right: true  },
                    { label: "QUELLEN",     right: true  },
                    { label: "VOL",         right: true  },
                  ].map(({ label, right }) => (
                    <th key={label} style={{
                      padding: "9px 14px", textAlign: right ? "right" : "left",
                      fontSize: 9, color: C.t3, fontWeight: 600, letterSpacing: "0.14em",
                    }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const isExpanded = expandedIdx === idx;
                  const sources    = item.drop_sources ?? [];
                  const topSource  = sources[0];
                  const isRelic    = topSource?.source_type === "relic";

                  return (
                    <>
                      <tr key={idx}
                        style={{
                          borderBottom: isExpanded ? "none" : `1px solid ${C.b}`,
                          transition: "background 0.12s",
                          cursor: sources.length > 0 ? "pointer" : "default",
                          background: isExpanded ? "rgba(200,168,75,0.05)" : "transparent",
                        }}
                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.hov; }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 10, color: C.t3 }}>
                          {idx + 1}
                        </td>

                        <td style={{ padding: "10px 14px", maxWidth: 220 }}>
                          <div style={{ fontWeight: 600, color: C.t, fontSize: 13, lineHeight: 1.3 }}>
                            {item.item_name}
                          </div>
                          {topSource && (
                            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                              {isRelic
                                ? `${topSource.relic_name ?? "?"} · ${topSource.rarity ?? "?"}`
                                : topSource.droptable?.replace("DropTable", "").replace(/([A-Z])/g, " $1").trim()
                              }
                            </div>
                          )}
                        </td>

                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: C.gold, fontWeight: 700 }}>
                          {item.avg_price.toFixed(1)}<SmallPlatIcon />
                        </td>

                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <span style={{
                            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                            color: C.up, padding: "2px 6px", borderRadius: 2,
                            background: `${C.up}18`, border: `1px solid ${C.up}44`,
                          }}>
                            {item.best_drop_chance_pct.toFixed(3)}%
                          </span>
                        </td>

                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: C.cy }}>
                          {item.value_per_drop > 0 ? item.value_per_drop.toFixed(3) : "—"}
                        </td>

                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          <span style={{
                            fontFamily: "monospace", fontSize: 10, color: C.t3,
                            padding: "2px 6px", border: `1px solid ${C.b}`, borderRadius: 2,
                            cursor: sources.length > 0 ? "pointer" : "default",
                          }}>
                            {sources.length} {isExpanded ? "▲" : "▼"}
                          </span>
                        </td>

                        <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: C.t3 }}>
                          {item.volume.toLocaleString("de-DE")}
                        </td>
                      </tr>

                      {/* Expanded drop sources */}
                      {isExpanded && (
                        <tr key={`${idx}-expand`} style={{ borderBottom: `1px solid ${C.b}`, background: "rgba(200,168,75,0.03)" }}>
                          <td colSpan={7} style={{ padding: "0 14px 0 28px" }}>
                            <DropSourcesList sources={sources} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};