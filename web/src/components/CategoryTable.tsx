import { useState } from "react";
import { SmallPlatIcon } from "./Icons";

interface CategoryItem {
  name:         string;
  slug:         string;
  avg_price:    number | null;
  min_price:    number | null;
  max_price:    number | null;
  volume:       number | null;
  tags:         string;
  ducats:       string | null;
  category?:    string;
  subcategory?: string | null;
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

type SortKey = "name" | "category" | "volume" | "avg_price" | "min_price" | "max_price";
type SortDir = "asc" | "desc";

export const CATEGORY_COLORS: Record<string, string> = {
  Warframes: "#5ab4c8",
  Waffen:    "#d45c5c",
  Mods:      "#c8a84b",
  Relics:    "#4dba7f",
  Arcanes:   "#c89050",
  Misc:      "#8a7eb8",
};

const MISC_SUB_COLORS: Record<string, string> = {
  "Fish":             "#4a9ebb",
  "Skins & Helmets":  "#b87ab8",
  "Scenes":           "#7ab87a",
  "Gems & Resources": "#b8a04a",
  "Ayatan":           "#c87a50",
  "Necramech":        "#8a9ab8",
  "Sonstiges":        "#7a7a7a",
};

const CategoryBadge = ({ cat }: { cat: string }) => {
  const color = CATEGORY_COLORS[cat] || "#7a6e52";
  return (
    <span style={{
      fontSize: 11, padding: "1px 7px", borderRadius: 2,
      color, background: `${color}20`, fontWeight: 500, whiteSpace: "nowrap",
    }}>{cat}</span>
  );
};

const SubcategoryBadge = ({ sub }: { sub: string }) => {
  const color = MISC_SUB_COLORS[sub] || "#7a7a7a";
  return (
    <span style={{
      fontSize: 10, padding: "1px 6px", borderRadius: 2, marginLeft: 5,
      color, background: `${color}18`, fontWeight: 400, whiteSpace: "nowrap",
      border: `1px solid ${color}30`,
    }}>{sub}</span>
  );
};

const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => (
  <svg width="8" height="10" viewBox="0 0 8 10" fill="none"
    style={{ marginLeft: 4, opacity: active ? 1 : 0.25, flexShrink: 0 }}>
    <path d="M4 1L4 9M4 1L1.5 3.5M4 1L6.5 3.5"
      stroke={active && dir === "asc"  ? "#c8a84b" : "currentColor"}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 9L1.5 6.5M4 9L6.5 6.5"
      stroke={active && dir === "desc" ? "#c8a84b" : "currentColor"}
      strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TH = ({
  children, right, sortKey, activeSort, sortDir, onSort,
}: {
  children:   React.ReactNode;
  right?:     boolean;
  sortKey?:   SortKey;
  activeSort: SortKey;
  sortDir:    SortDir;
  onSort:     (k: SortKey) => void;
}) => {
  const isActive = sortKey === activeSort;
  return (
    <th
      onClick={() => sortKey && onSort(sortKey)}
      style={{
        padding: "9px 15px",
        textAlign: right ? "right" : "left",
        fontSize: 11, color: isActive ? "#c8a84b" : "#7a6e52", fontWeight: 500,
        borderBottom: "1px solid rgba(200,168,75,0.22)",
        whiteSpace: "nowrap", letterSpacing: "0.1em", textTransform: "uppercase",
        cursor: sortKey ? "pointer" : "default",
        userSelect: "none", transition: "color 0.12s",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center",
        justifyContent: right ? "flex-end" : "flex-start", gap: 2 }}>
        {children}
        {sortKey && <SortIcon active={isActive} dir={sortDir} />}
      </span>
    </th>
  );
};

export const CategoryTable = ({ category, allCategories, miscSub }: CategoryTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      // Text columns default ascending, number columns default descending
      setSortDir(key === "name" || key === "category" ? "asc" : "desc");
    }
  };

  // ── Build item list ──
  let items: CategoryItem[] = [];
  if (category === "Alle") {
    items = allCategories.flatMap(c =>
      c.items.map(it => ({ ...it, category: it.category ?? c.name }))
    );
  } else if (category === "Misc") {
    const miscItems = allCategories.find(c => c.name === "Misc")?.items ?? [];
    items = miscSub ? miscItems.filter(it => it.subcategory === miscSub) : miscItems;
  } else {
    items = allCategories.find(c => c.name === category)?.items ?? [];
  }

  // ── Sort ──
  const sorted = [...items].sort((a, b) => {
    let av: string | number;
    let bv: string | number;

    if (sortKey === "name") {
      av = a.name?.toLowerCase() ?? "";
      bv = b.name?.toLowerCase() ?? "";
      return sortDir === "asc"
        ? av.localeCompare(bv)
        : bv.localeCompare(av);
    }
    if (sortKey === "category") {
      av = (a.category ?? a.subcategory ?? "")?.toLowerCase();
      bv = (b.category ?? b.subcategory ?? "")?.toLowerCase();
      return sortDir === "asc"
        ? av.localeCompare(bv)
        : bv.localeCompare(av);
    }

    // Numeric columns — null sorts to bottom always
    const an = a[sortKey] as number | null;
    const bn = b[sortKey] as number | null;
    if (an == null && bn == null) return 0;
    if (an == null) return 1;
    if (bn == null) return -1;
    return sortDir === "desc" ? bn - an : an - bn;
  });

  const showCategoryCol    = category === "Alle";
  const showSubcategoryCol = category === "Misc" && !miscSub;
  const colSpan = 7 + (showCategoryCol || showSubcategoryCol ? 1 : 0);
  const thProps = { activeSort: sortKey, sortDir, onSort: handleSort };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.12)" }}>
            <TH {...thProps}>#</TH>
            <TH {...thProps} sortKey="name">Item</TH>
            {showCategoryCol    && <TH {...thProps} sortKey="category">Kategorie</TH>}
            {showSubcategoryCol && <TH {...thProps} sortKey="category">Typ</TH>}
            <TH {...thProps} right sortKey="avg_price">Avg Price</TH>
            <TH {...thProps} right sortKey="min_price">Min</TH>
            <TH {...thProps} right sortKey="max_price">Max</TH>
            <TH {...thProps} right sortKey="volume">Volumen</TH>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={colSpan} style={{
                textAlign: "center", padding: "32px 16px",
                color: "#7a6e52", fontSize: 13, fontStyle: "italic",
              }}>
                Keine Daten verfügbar für diese Kategorie
              </td>
            </tr>
          ) : sorted.map((item, idx) => (
            <tr
              key={`${item.slug}-${idx}`}
              style={{ borderBottom: "1px solid rgba(200,168,75,0.08)", transition: "background 0.08s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(200,168,75,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ padding: "10px 15px", fontFamily: "monospace", fontSize: 11, color: "#7a6e52", minWidth: 36 }}>
                {idx + 1}
              </td>
              <td style={{ padding: "10px 15px" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#e8dfc0" }}>{item.name}</span>
              </td>

              {showCategoryCol && (
                <td style={{ padding: "10px 15px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {item.category && <CategoryBadge cat={item.category} />}
                    {item.category === "Misc" && item.subcategory && (
                      <SubcategoryBadge sub={item.subcategory} />
                    )}
                  </div>
                </td>
              )}
              {showSubcategoryCol && (
                <td style={{ padding: "10px 15px" }}>
                  {item.subcategory && <SubcategoryBadge sub={item.subcategory} />}
                </td>
              )}

              <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 14, color: "#c8a84b", fontWeight: 700 }}>
                {item.avg_price != null ? item.avg_price.toFixed(1) : "—"}<SmallPlatIcon />
              </td>
              <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#b8a97c" }}>
                {item.min_price != null ? item.min_price : "—"}
              </td>
              <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#b8a97c" }}>
                {item.max_price != null ? item.max_price : "—"}
              </td>
              <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 13, color: "#b8a97c" }}>
                {item.volume?.toLocaleString("de-DE") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};