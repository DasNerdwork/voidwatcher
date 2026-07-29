import { useEffect, useState } from "react";

// ─── Mini-Router ──────────────────────────────────────────────────────────────
// History-API statt react-router: die App kennt genau zwei Routen ("/" und
// "/item/:slug"), da lohnt keine Dependency. nginx liefert bereits per
// try_files auf index.html zurück, für Cloudflare Pages tut das public/_redirects.

const NAV_EVENT = "vw:navigate";

export const navigate = (path: string) => {
  if (path === window.location.pathname) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo(0, 0);
};

export const useRoute = (): string => {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener(NAV_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAV_EVENT, sync);
    };
  }, []);

  return path;
};

/** "/item/ember_prime_set" → "ember_prime_set", sonst null */
export const itemSlugFromPath = (path: string): string | null => {
  const m = path.match(/^\/item\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
};

export const itemPath = (slug: string) => `/item/${encodeURIComponent(slug)}`;

// ─── Link ─────────────────────────────────────────────────────────────────────
// Echtes <a>, damit Mittelklick und Strg/Cmd-Klick weiterhin einen neuen Tab
// öffnen — nur der einfache Linksklick wird abgefangen.

interface AProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export const A: React.FC<AProps> = ({ href, onClick, children, style, ...rest }) => (
  <a
    href={href}
    onClick={e => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    }}
    style={{ color: "inherit", textDecoration: "none", ...style }}
    {...rest}
  >
    {children}
  </a>
);
