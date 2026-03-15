interface CategoryItem {
  name: string;
  slug: string;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  volume: number | null;
  tags: string;
  ducats: string | null;
  category?: string;
}

interface CategoriesOverview {
  name: string;
  slug: string;
  items: CategoryItem[];
}

interface CategoryTableProps {
  category: string;
  allCategories: CategoriesOverview[];
}

// ─── Category color mapping ────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  Warframes:   "#5ab4c8",
  Waffen:      "#d45c5c",
  Mods:        "#c8a84b",
  Relics:      "#4dba7f",
  Ressourcen:  "#8f7a40",
  Arcanes:     "#c89050",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PlatIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 2, flexShrink: 0 }}>
    <circle cx="5.5" cy="5.5" r="4.5" stroke="#c8a84b" strokeWidth="1.1" fill="none" />
    <text x="5.5" y="8.3" textAnchor="middle" fontSize="6" fill="#c8a84b" fontFamily="monospace">₱</text>
  </svg>
);

const CategoryBadge = ({ cat }: { cat: string }) => {
  const color = CATEGORY_COLORS[cat] || "#7a6e52";
  return (
    <span style={{
      fontSize: 11,
      padding: "1px 7px",
      borderRadius: 2,
      color,
      background: `${color}20`,
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}>
      {cat}
    </span>
  );
};

// ─── Category Table ────────────────────────────────────────────────────────────
export const CategoryTable = ({ category, allCategories }: CategoryTableProps) => {
  // "Alle" = merge all categories, otherwise find the matching one
  const items: CategoryItem[] = category === "Alle"
    ? allCategories.flatMap(c => c.items.map(it => ({ ...it, category: it.category ?? c.name })))
    : (allCategories.find(c => c.name === category)?.items ?? []);

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th style={{
      padding: "9px 15px",
      textAlign: right ? "right" : "left",
      fontSize: 11,
      color: "#7a6e52",
      fontWeight: 500,
      borderBottom: "1px solid rgba(200,168,75,0.22)",
      whiteSpace: "nowrap",
      letterSpacing: "0.1em",
      textTransform: "uppercase",
    }}>
      {children}
    </th>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "rgba(0,0,0,0.12)" }}>
            <TH>#</TH>
            <TH>Item</TH>
            <TH>Kategorie</TH>
            <TH right>Avg Price</TH>
            <TH right>Min</TH>
            <TH right>Max</TH>
            <TH right>Volumen</TH>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "#7a6e52",
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: 13,
                fontStyle: "italic",
              }}>
                Keine Daten verfügbar für diese Kategorie
              </td>
            </tr>
          ) : items.map((item, idx) => (
            <tr
              key={item.slug}
              style={{ borderBottom: "1px solid rgba(200,168,75,0.22)", transition: "background 0.08s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(200,168,75,0.07)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ padding: "10px 15px", fontFamily: "monospace", fontSize: 11, color: "#7a6e52", textAlign: "left", minWidth: 36 }}>
                {idx + 1}
              </td>
              <td style={{ padding: "10px 15px" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#e8dfc0", fontFamily: "system-ui, -apple-system, sans-serif" }}>
                  {item.name}
                </div>
              </td>
              <td style={{ padding: "10px 15px" }}>
                {item.category && <CategoryBadge cat={item.category} />}
              </td>
              <td style={{ padding: "10px 15px", textAlign: "right", fontFamily: "monospace", fontSize: 14, color: "#c8a84b", fontWeight: 700 }}>
                <PlatIcon />{item.avg_price != null ? item.avg_price.toFixed(1) : "—"}
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