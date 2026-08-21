"use client";

import { useEffect, useRef, useState } from "react";
import { scrollBus, uiRefs } from "@/lib/ui";

const LINKS: Array<[string, string]> = [
  ["OVERVIEW", "#top"],
  ["PERFORMANCE", "#performance"],
  ["DESIGN", "#design"],
  ["M POWER", "#m-power"],
];

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const linksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    uiRefs.navLinks = linksRef.current;
    return () => {
      uiRefs.navLinks = null;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (hash: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    if (hash === "#top") {
      scrollBus.scrollTo(0);
    } else {
      scrollBus.scrollTo(hash);
    }
  };

  return (
    <header className="nav">
      <a className="nav-logo" href="#top" onClick={go("#top")} data-cursor-hover aria-label="M3 Unleashed — back to top">
        M3 <span>//</span>
      </a>
      <div className="nav-links" ref={linksRef}>
        {LINKS.map(([label, hash]) => (
          <a key={hash} href={hash} onClick={go(hash)} data-cursor-hover>
            {label}
          </a>
        ))}
      </div>
      <button
        type="button"
        className="nav-menu-btn"
        data-cursor-hover
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="nav-overlay"
      >
        MENU
      </button>
      {open ? (
        <div id="nav-overlay" className="nav-overlay" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="nav-overlay-close" onClick={() => setOpen(false)} aria-label="Close menu">
            CLOSE
          </button>
          <nav className="nav-overlay-links" aria-label="Site sections">
            {LINKS.map(([label, hash]) => (
              <a key={hash} href={hash} onClick={go(hash)}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
