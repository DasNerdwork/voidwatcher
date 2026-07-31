import { useEffect, useState, useCallback } from "react";
import { SmallPlatIcon } from "./Icons";
import { C, CardCorner, FilterLabel, T, TagFilter, VitFlourish, pctChange, plat, segBtn } from "./shared";
import { A, itemPath, navigate } from "../router";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MoverItem {
  item_name:     string;
  slug:          string;
  tags:          string;
  current_price: number;
  start_price:   number;
  volume:        number;
  change_pct:    number;
}

interface StableItem {
  item_name:    string;
  slug:         string;
  tags:         string;
  avg_price:    number;
  min_price:    number;
  max_price:    number;
  volume:       number;
  spread_ratio: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS_OPTIONS = [
  { value: 7,  label: "7T" },
  { value: 14, label: "14T" },
  { value: 30, label: "30T" },
  { value: 90, label: "90T" },
];

// ─── Change badge ─────────────────────────────────────────────────────────────
const ChangeBadge = ({ pct }: { pct: number }) => {
  const up    = pct >= 0;
  const color = up ? C.up : C.down;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 13, fontWeight: 700,
      color, padding: "2px 6px", borderRadius: 2,
      background: `${color}18`, border: `1px solid ${color}44`,
    }}>
      {pctChange(pct)}
    </span>
  );
};

// ─── Movers Table ─────────────────────────────────────────────────────────────
interface MoversTableProps {
  title:       string;
  subtitle:    string;
  items:       MoverItem[];
  loading:     boolean;
  accentColor: string;
}

const MoversTable = ({ title, subtitle, items, loading, accentColor }: MoversTableProps) => (
  <div style={{
    background: C.card, border: `1px solid ${C.b}`, borderRadius: C.rad,
    overflow: "hidden", position: "relative", backdropFilter: "blur(10px)", flex: 1,
  }}>
    <CardCorner />
    <div style={{
      padding: "13px 18px", borderBottom: `1px solid ${C.b}`,
      background: "rgba(0,0,0,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <div style={{ width: 2, height: 15, borderRadius: 1, background: accentColor, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.t }}>{title}</div>
          <div style={{ ...T.meta, marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <VitFlourish />
    </div>

    {loading ? (
      <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 13 }}>
        LADEN...
      </div>
    ) : items.length === 0 ? (
      <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontSize: 14, fontStyle: "italic" }}>
        Keine Daten für diesen Zeitraum
      </div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.b}` }}>
              {["#", "ITEM", "START", "JETZT", "CHANGE", "VOL"].map((h, i) => (
                <th key={h} style={{
                  padding: "9px 14px", textAlign: i >= 2 ? "right" : "left",
                  fontSize: 12, color: C.t2, fontWeight: 600, letterSpacing: "0.1em",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}
                onClick={() => navigate(itemPath(item.slug))}
                style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.12s", cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.t2, minWidth: 28 }}>
                  {idx + 1}
                </td>
                <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                  <A href={itemPath(item.slug)} style={{ display: "block", fontWeight: 600, color: C.t, fontSize: 14, lineHeight: 1.3 }}>
                    {item.item_name}
                  </A>
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                  {plat(item.start_price)}<SmallPlatIcon />
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 14, color: C.gold, fontWeight: 700 }}>
                  {plat(item.current_price)}<SmallPlatIcon />
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  <ChangeBadge pct={item.change_pct} />
                </td>
                <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                  {item.volume.toLocaleString("de-DE")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// ─── Stable Table ─────────────────────────────────────────────────────────────
const StableTable = ({ items, loading }: { items: StableItem[]; loading: boolean }) => (
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
        <div style={{ width: 2, height: 15, borderRadius: 1, background: C.cy, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.t }}>Stabilste Items</div>
          <div style={{ ...T.meta, marginTop: 2 }}>Niedrigster Preis-Spread (min/max vs avg)</div>
        </div>
      </div>
      <VitFlourish />
    </div>

    {loading ? (
      <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontFamily: "monospace", letterSpacing: "0.15em", fontSize: 13 }}>
        LADEN...
      </div>
    ) : items.length === 0 ? (
      <div style={{ padding: "40px 16px", textAlign: "center", color: C.t2, fontSize: 14, fontStyle: "italic" }}>
        Keine Daten verfügbar
      </div>
    ) : (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.b}` }}>
              {["#", "ITEM", "AVG PREIS", "MIN", "MAX", "SPREAD", "VOL"].map((h, i) => (
                <th key={h} style={{
                  padding: "9px 14px", textAlign: i >= 2 ? "right" : "left",
                  fontSize: 12, color: C.t2, fontWeight: 600, letterSpacing: "0.1em",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const spreadPct = (item.spread_ratio * 100).toFixed(1);
              const spreadColor = item.spread_ratio < 0.1 ? C.up : item.spread_ratio < 0.3 ? C.gold : C.down;
              return (
                <tr key={idx}
                  onClick={() => navigate(itemPath(item.slug))}
                  style={{ borderBottom: `1px solid ${C.b}`, transition: "background 0.12s", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.hov)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: C.t2 }}>{idx + 1}</td>
                  <td style={{ padding: "10px 14px", maxWidth: 200 }}>
                    <A href={itemPath(item.slug)} style={{ display: "block", fontWeight: 600, color: C.t, fontSize: 14 }}>{item.item_name}</A>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 14, color: C.gold, fontWeight: 700 }}>
                    {plat(item.avg_price)}<SmallPlatIcon />
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                    {plat(item.min_price)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                    {plat(item.max_price)}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <span style={{
                      fontFamily: "monospace", fontSize: 12, fontWeight: 700,
                      color: spreadColor, padding: "2px 6px", borderRadius: 2,
                      background: `${spreadColor}18`, border: `1px solid ${spreadColor}44`,
                    }}>
                      {spreadPct}%
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: C.t2 }}>
                    {item.volume.toLocaleString("de-DE")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

// ─── MoversPage ───────────────────────────────────────────────────────────────
export const MoversPage = () => {
  const [days, setDays]               = useState(7);
  const [tag, setTag]                 = useState<string | null>(null);
  const [gainers, setGainers]         = useState<MoverItem[]>([]);
  const [losers, setLosers]           = useState<MoverItem[]>([]);
  const [stable, setStable]           = useState<StableItem[]>([]);
  const [loadingMovers, setLoadingMovers] = useState(true);
  const [loadingStable, setLoadingStable] = useState(true);

  const fetchMovers = useCallback(async () => {
    setLoadingMovers(true);
    const tagParam = tag ? `&tag=${tag}` : "";
    try {
      const [gRes, lRes] = await Promise.all([
        fetch(`/api/market/movers?days=${days}&direction=gainers&limit=15${tagParam}`),
        fetch(`/api/market/movers?days=${days}&direction=losers&limit=15${tagParam}`),
      ]);
      const [gJson, lJson] = await Promise.all([gRes.json(), lRes.json()]);
      setGainers(gJson.items ?? []);
      setLosers(lJson.items ?? []);
    } catch { /* keep */ }
    finally { setLoadingMovers(false); }
  }, [days, tag]);

  const fetchStable = useCallback(async () => {
    setLoadingStable(true);
    const tagParam = tag ? `&tag=${tag}` : "";
    try {
      const res  = await fetch(`/api/market/stable?hours=48&limit=20&min_volume=5${tagParam}`);
      const json = await res.json();
      setStable(json.items ?? []);
    } catch { /* keep */ }
    finally { setLoadingStable(false); }
  }, [tag]);

  useEffect(() => { fetchMovers(); }, [fetchMovers]);
  useEffect(() => { fetchStable(); }, [fetchStable]);

  return (
    <>
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <FilterLabel>ZEITRAUM</FilterLabel>
          {DAYS_OPTIONS.map(({ value, label }) => (
            <button key={value} onClick={() => setDays(value)} style={segBtn(days === value)}
              onMouseEnter={e => { if (days !== value) e.currentTarget.style.color = C.t; }}
              onMouseLeave={e => { if (days !== value) e.currentTarget.style.color = C.t3; }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: C.b, flexShrink: 0 }} />
        <TagFilter activeTag={tag} onChange={setTag} />
      </div>

      {/* Gainers / Losers side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <MoversTable
          title="Top Gainers"
          subtitle={`Stärkste Preisanstiege · ${days}T`}
          items={gainers}
          loading={loadingMovers}
          accentColor={C.up}
        />
        <MoversTable
          title="Top Losers"
          subtitle={`Stärkste Preisrückgänge · ${days}T`}
          items={losers}
          loading={loadingMovers}
          accentColor={C.down}
        />
      </div>

      {/* Stable items */}
      <StableTable items={stable} loading={loadingStable} />
    </>
  );
};