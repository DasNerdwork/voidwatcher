import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
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
    animation: ticker-scroll 60s linear infinite;
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

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-in { animation: fadeInUp 0.4s ease forwards; }
  .fade-in-2 { animation: fadeInUp 0.4s 0.1s ease both; }
  .fade-in-3 { animation: fadeInUp 0.4s 0.2s ease both; }
  .fade-in-4 { animation: fadeInUp 0.4s 0.3s ease both; }

  .scanline::after {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.03) 2px,
      rgba(0,0,0,0.03) 4px
    );
    pointer-events: none;
    z-index: 9999;
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
    <App />
  </React.StrictMode>
);