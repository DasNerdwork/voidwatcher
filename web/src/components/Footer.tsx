import { C } from "./shared";

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
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: C.t3, fontFamily: "monospace", flexWrap: "wrap" }}>
          {status.wf_build_label && (
            <span>WF <span style={{ color: C.t2 }}>{status.wf_build_label}</span></span>
          )}
          {status.wfpe_version && (
            <span>
              WFPE{" "}
              <a href="https://github.com/calamity-inc/warframe-public-export-plus" target="_blank" rel="noopener"
                style={{ color: C.t2, textDecoration: "none" }}>
                v{status.wfpe_version}
              </a>
            </span>
          )}
          {status.wfm_items_updated_at && (
            <span>WFM <span style={{ color: C.t2 }}>
              {new Date(status.wfm_items_updated_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
            </span></span>
          )}
          {status.last_updated && (
            <span>Sync <span style={{ color: C.t2 }}>
              {new Date(status.last_updated).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span></span>
          )}
        </div>
      )}

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