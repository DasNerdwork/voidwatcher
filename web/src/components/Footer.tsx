import { C, T, TextLink } from "./shared";

interface StatusResponse {
  wf_build_label:          string | null;
  wfpe_version:            string | null;
  wfpe_version_updated_at: string | null;
  wfm_items_updated_at:    string | null;
  last_updated:            string | null;
}

interface FooterProps {
  status?: StatusResponse | null;
}

export const Footer = ({ status }: FooterProps) => (
  <footer style={{
    borderTop:      `1px solid ${C.b}`,
    background:     "rgba(8,10,26,0.7)",
    backdropFilter: "blur(10px)",
    marginTop:      "auto",
  }}>
    <div style={{
      maxWidth:      1400,
      margin:        "0 auto",
      padding:       "24px 22px",
      display:       "flex",
      flexDirection: "column",
      gap:           10,
    }}>

      {/* Version info row */}
      {status && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: C.t2, fontFamily: "monospace", flexWrap: "wrap" }}>
          {status.wf_build_label && (
            <span>WF <span style={{ color: C.t, fontWeight: 600 }}>{status.wf_build_label}</span></span>
          )}
          {status.wfpe_version && (
            <span>
              WFPE{" "}
              <TextLink href="https://github.com/calamity-inc/warframe-public-export-plus"
                target="_blank" rel="noopener" color={C.t} style={{ fontWeight: 600 }}>
                v{status.wfpe_version}
              </TextLink>
            </span>
          )}
          {status.wfm_items_updated_at && (
            <span>WFM <span style={{ color: C.t, fontWeight: 600 }}>
              {new Date(status.wfm_items_updated_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            </span></span>
          )}
          {status.last_updated && (
            <span>Sync <span style={{ color: C.t, fontWeight: 600 }}>
              {new Date(status.last_updated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span></span>
          )}
        </div>
      )}

      <p style={{ ...T.meta, lineHeight: 1.7, maxWidth: 860 }}>
        Digital Extremes Ltd, Warframe and the logo Warframe are registered trademarks.
        All rights are reserved worldwide. This site has no official link with Digital Extremes Ltd or Warframe.
        All artwork, screenshots, characters or other recognizable features of the intellectual property
        relating to these trademarks are likewise the intellectual property of Digital Extremes Ltd.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 4, ...T.meta }}>
        <span>© 2026 Voidwatch.DasNerdwork.net | </span>
        <TextLink href="https://dasnerdwork.net/impressum" color={C.gold}>
          Impressum
        </TextLink>
        &amp;
        <TextLink href="https://dasnerdwork.net/datenschutz" color={C.gold}>
          Datenschutz
        </TextLink>
      </div>

    </div>
  </footer>
);