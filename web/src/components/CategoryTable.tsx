import { memo, useMemo } from "react";
import { SmallPlatIcon } from "./Icons";
import {
  C, CategoryBadge, ItemThumb, MISC_SUB_COLORS, SortableTH, T,
  hoverRow, plat, useSortState,
} from "./shared";
import { A, itemPath, navigate } from "../router";
import { itemName, locale, t, useI18n } from "../i18n";

interface CategoryItem {
  name:                  string;
  slug:                  string;
  avg_price:             number | null;
  min_price:             number | null;
  max_price:             number | null;
  volume:                number | null;
  tags:                  string;
  ducats:                string | null;
  max_rank?:             number | null;
  thumb_path?:           string | null;
  best_drop_chance_pct?: number | null;
  category?:             string;
  subcategory?:          string | null;
}

interface CategoriesOverview {
  name:  string;
  slug:  string;
  items: CategoryItem[];
}

interface CategoryTableProps {
  category:      string;
  allCategories: CategoriesOverview[];
  miscSub?:      string | null;
}

type SortKey = "name" | "category" | "volume" | "avg_price" | "min_price" | "max_price" | "best_drop_chance_pct";

const SubcategoryBadge = ({ sub }: { sub: string }) => {
  const color = MISC_SUB_COLORS[sub] || C.t2;
  return (
    <span style={{
      fontSize: 12, padding: "2px 7px", borderRadius: C.rad, marginLeft: 5,
      color, background: `${color}18`, fontWeight: 400, whiteSpace: "nowrap",
      border: `1px solid ${color}30`,
    }}>{t(sub)}</span>
  );
};

/**
 * Die Tabelle des Category Browsers — bis zu 2550 Zeilen auf einmal.
 *
 * memo() und die beiden useMemo sind hier kein Feinschliff, sondern der
 * Unterschied zwischen flüssig und hakelig: die Uhr im Header ließ App früher
 * sekündlich neu rendern, und weil beides fehlte, entstanden dabei jedes Mal
 * 2550 neue Objekte plus eine vollständige Sortierung (bei Namenssortierung
 * ~29.000 localeCompare-Aufrufe). Gemessen: 100–130 ms Blockade pro Sekunde.
 * Die Uhr liegt inzwischen in ihrer eigenen Komponente — memo hält die Tabelle
 * auch von der nächsten Zustandsänderung in App fern.
 */
export const CategoryTable = memo(({ category, allCategories, miscSub }: CategoryTableProps) => {
  // SortIcon, Kopfzelle und Sortiersemantik liegen in shared.tsx — dieselbe
  // Mechanik trägt die Warframe-Übersicht.
  const [sortKey, sortDir, handleSort] =
    useSortState<SortKey>("volume", "desc", ["name", "category"]);
  // Sprachwechsel muss die Sortierung neu anwerfen (Namen ändern sich) und die
  // Tabelle trotz memo() neu zeichnen.
  const { items: lang } = useI18n();

  const items = useMemo<CategoryItem[]>(() => {
    if (category === "All") {
      return allCategories.flatMap(c =>
        c.items.map(it => ({ ...it, category: it.category ?? c.name }))
      );
    }
    if (category === "Misc") {
      const miscItems = allCategories.find(c => c.name === "Misc")?.items ?? [];
      return miscSub ? miscItems.filter(it => it.subcategory === miscSub) : miscItems;
    }
    return allCategories.find(c => c.name === category)?.items ?? [];
  }, [category, allCategories, miscSub]);

  const sorted = useMemo(() => [...items].sort((a, b) => {
    if (sortKey === "name") {
      // Sortiert wird nach dem ANGEZEIGTEN Namen — sonst steht die Liste im
      // Deutsch-Modus in englischer Reihenfolge da.
      const av = itemName(a).toLowerCase();
      const bv = itemName(b).toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (sortKey === "category") {
      const av = (a.category ?? a.subcategory ?? "").toLowerCase();
      const bv = (b.category ?? b.subcategory ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = a[sortKey] as number | null;
    const bn = b[sortKey] as number | null;
    if (an == null && bn == null) return 0;
    if (an == null) return 1;
    if (bn == null) return -1;
    return sortDir === "desc" ? bn - an : an - bn;
  }), [items, sortKey, sortDir, lang]);

  const showCategoryCol    = category === "All";
  const showSubcategoryCol = category === "Misc" && !miscSub;
  const thProps = { activeSort: sortKey, sortDir, onSort: handleSort };
  // Grundspalten: #, Item, Avg, Min, Max, Drop%, Vol. Der frühere Literal stand
  // auf 8 und war schon damals um eins daneben.
  const COLS = 7;

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="cat-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.12)" }}>
            <SortableTH {...thProps}>#</SortableTH>
            <SortableTH {...thProps} sortKey="name">{t("Item")}</SortableTH>
            {showCategoryCol    && <SortableTH {...thProps} sortKey="category">{t("Category")}</SortableTH>}
            {showSubcategoryCol && <SortableTH {...thProps} sortKey="category">{t("Type")}</SortableTH>}
            <SortableTH {...thProps} right sortKey="avg_price">{t("Avg")}</SortableTH>
            <SortableTH {...thProps} right sortKey="min_price">{t("Min")}</SortableTH>
            <SortableTH {...thProps} right sortKey="max_price">{t("Max")}</SortableTH>
            <SortableTH {...thProps} right sortKey="best_drop_chance_pct">{t("Drop%")}</SortableTH>
            <SortableTH {...thProps} right sortKey="volume">{t("Vol")}</SortableTH>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={COLS + (showCategoryCol || showSubcategoryCol ? 1 : 0)} style={{
                textAlign: "center", padding: "32px 16px",
                color: C.t2, fontSize: 14, fontStyle: "italic",
              }}>
                {t("No data available for this category")}
              </td>
            </tr>
          ) : sorted.map((item, idx) => (
            <tr
              key={item.slug}
              onClick={() => navigate(itemPath(item.slug))}
              style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.08s", cursor: "pointer" }}
              {...hoverRow}
            >
              {/* # */}
              <td style={{ padding: "9px 15px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.t2, minWidth: 36 }}>
                {idx + 1}
              </td>

              {/* Icon + Name + Rang */}
              <td style={{ padding: "9px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <ItemThumb path={item.thumb_path} name={item.name} />
                  <div style={{ minWidth: 0 }}>
                    <A href={itemPath(item.slug)}
                      style={{ ...T.bodyStrong, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                      {itemName(item)}
                    </A>
                    {item.max_rank != null && item.max_rank > 0 && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.gold, marginTop: 2 }}>
                        {t("Rank %d", item.max_rank)}
                      </div>
                    )}
                  </div>
                </div>
              </td>

              {/* Kategorie */}
              {showCategoryCol && (
                <td style={{ padding: "9px 15px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {item.category && <CategoryBadge cat={item.category} />}
                    {item.category === "Misc" && item.subcategory && (
                      <SubcategoryBadge sub={item.subcategory} />
                    )}
                  </div>
                </td>
              )}
              {showSubcategoryCol && (
                <td style={{ padding: "9px 15px" }}>
                  {item.subcategory && <SubcategoryBadge sub={item.subcategory} />}
                </td>
              )}

              {/* Avg Price */}
              <td style={{ padding: "9px 15px", textAlign: "right", ...T.num, color: C.gold, whiteSpace: "nowrap" }}>
                {plat(item.avg_price)}<SmallPlatIcon />
              </td>

              {/* Min */}
              <td style={{ padding: "9px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                {plat(item.min_price)}
              </td>

              {/* Max */}
              <td style={{ padding: "9px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                {plat(item.max_price)}
              </td>

              {/* Drop Chance */}
              <td style={{ padding: "9px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13 }}>
                {item.best_drop_chance_pct != null && item.best_drop_chance_pct > 0
                  ? <span style={{ color: C.up, fontWeight: 700 }}>{item.best_drop_chance_pct.toFixed(3)}%</span>
                  : <span style={{ color: C.t2 }}>—</span>
                }
              </td>

              {/* Volume */}
              <td style={{ padding: "9px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                {item.volume?.toLocaleString(locale()) ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

CategoryTable.displayName = "CategoryTable";
