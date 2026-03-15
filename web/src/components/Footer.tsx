const C = {
  b:    "rgba(200,168,75,0.22)",
  t2:   "#b8a97c",
  t3:   "#7a6e52",
  gold: "#c8a84b",
} as const;

// ─── Footer ───────────────────────────────────────────────────────────────────
export const Footer = () => (
  <footer style={{
    borderTop:      `1px solid ${C.b}`,
    background:     "rgba(8,10,26,0.7)",
    backdropFilter: "blur(10px)",
    marginTop:      "auto", // pushes footer to bottom when flex column
  }}>
    <div style={{
      maxWidth:      1400,
      margin:        "0 auto",
      padding:       "24px 22px",
      display:       "flex",
      flexDirection: "column",
      gap:           10,
    }}>
      <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.75, maxWidth: 820 }}>
        Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks.
        All rights are reserved worldwide. This site has no official link with Digital Extremes Ltd or Warframe.
        All artwork, screenshots, characters or other recognizable features of the intellectual property
        relating to these trademarks are likewise the intellectual property of Digital Extremes Ltd.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.t3 }}>
        <span>© 2026 Voidwatch.DasNerdwork.net | </span>
        <a href="https://dasnerdwork.net/impressum"
          style={{ color: C.t2, textDecoration: "underline", textUnderlineOffset: 2 }}>
          Impressum
        </a>
        &amp;
        <a href="https://dasnerdwork.net/datenschutz"
          style={{ color: C.t2, textDecoration: "underline", textUnderlineOffset: 2 }}>
          Datenschutz
        </a>
      </div>
    </div>
  </footer>
);