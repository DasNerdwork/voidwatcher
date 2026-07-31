import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n/Provider";
import "./index.css";

// ─── Font Injection ────────────────────────────────────────────────────────────
const injectFonts = () => {
  if (document.getElementById("voidwatch-fonts")) return;
  const link = document.createElement("link");
  link.id = "voidwatch-fonts";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
};

// ─── Global Styles Injection ───────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes ticker-scroll {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  .ticker-track {
    display: flex;
    animation: ticker-scroll 65s linear infinite;
    width: max-content;
  }
  .ticker-track:hover { animation-play-state: paused; }

  @keyframes glow-pulse {
    0%, 100% { opacity: 0.6; }
    50%       { opacity: 1; }
  }
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--up);
    box-shadow: 0 0 6px var(--up);
    animation: glow-pulse 2s ease-in-out infinite;
  }
`;

// ─── Run on mount ──────────────────────────────────────────────────────────────
injectFonts();
const style = document.createElement("style");
style.id = "vw-global";
style.textContent = GLOBAL_CSS;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);