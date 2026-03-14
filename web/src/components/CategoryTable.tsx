import React from "react";

interface CategoryItem {
  name: string;
  slug: string;
  avg_price: number | null;
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

// ─── Category Mapping ──────────────────────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  "Warframes": "#22D3EE",
  "Waffen": "#FF4D6D",
  "Mods": "#C8A84B",
  "Relics": "#00D68F",
  "Ressourcen": "#A88A30",
  "Arcanes": "#FFA500",
};

// ─── Category Table ────────────────────────────────────────────────────────────
export const CategoryTable = ({ category, allCategories }: CategoryTableProps) => {
  const catData = allCategories.find(c => c.name === category) || allCategories[0];
  const items = catData ? catData.items : [];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--bg-void)", borderBottom: "1px solid var(--border)" }}>
            {["#", "ITEM", "KATEGORIE", "Ø PREIS", "VOLUMEN"].map((h) => (
              <th key={h} style={{
                padding: "10px 16px", textAlign: h === "#" || h === "VOLUMEN" ? "center" : "left",
                fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.15em",
                color: "var(--text-muted)", fontWeight: 600,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.slug} style={{
              borderBottom: "1px solid var(--border)",
              transition: "background 0.15s",
              cursor: "default",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{idx + 1}</td>
              <td style={{ padding: "10px 16px" }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{item.name}</div>
              </td>
              <td style={{ padding: "10px 16px" }}>
                <span style={{
                  fontSize: 10, fontFamily: "var(--font-display)", letterSpacing: "0.1em",
                  color: item.category ? CATEGORY_COLORS[item.category] || "var(--text-muted)" : "var(--text-muted)",
                  background: item.category ? `${CATEGORY_COLORS[item.category] || "var(--text-muted)"}11` : "transparent",
                  padding: "2px 8px", borderRadius: 3,
                }}>
                  {item.category || "UNKNOWN"}
                </span>
              </td>
              <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--plat)", fontWeight: 700 }}>
                <PlatIcon />{item.avg_price ?? "—"}
              </td>
              <td style={{ padding: "10px 16px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)" }}>
                {item.volume?.toLocaleString("de-DE") ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <div style={{
          padding: "20px 16px", fontSize: 12, color: "var(--text-muted)",
          borderTop: "1px solid var(--border)", fontStyle: "italic",
          fontFamily: "var(--font-body)", textAlign: "center",
        }}>
          Keine Daten verfügbar für diese Kategorie
        </div>
      )}
    </div>
  );
};

// ─── PlatIcon (inline für CategoryTable) ────────────────────────────────────────
const PlatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }}>
    <circle cx="7" cy="7" r="6" stroke="#C8A84B" strokeWidth="1.5"/>
    <path d="M4.5 9.5L7 4.5L9.5 9.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5.5 7.5H8.5" stroke="#C8A84B" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);