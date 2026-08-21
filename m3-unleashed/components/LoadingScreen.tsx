"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

interface LoadingScreenProps {
  phase: "loading" | "active" | "stalled";
  pct: number;
  ready: number;
  total: number;
  onContinue: () => void;
}

export default function LoadingScreen({ phase, pct, ready, total, onContinue }: LoadingScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissed = useRef(false);

  useEffect(() => {
    if (phase !== "active" || dismissed.current || !ref.current) return;
    dismissed.current = true;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.to(ref.current, {
      autoAlpha: 0,
      duration: reduced ? 0 : 0.7,
      ease: "power2.inOut",
      onComplete: () => {
        if (ref.current) ref.current.style.display = "none";
      },
    });
  }, [phase]);

  const displayPct = phase === "stalled" ? -1 : Math.round(pct * 100);

  return (
    <div className="loading-screen" ref={ref} role="status" aria-live="polite">
      <div className="loading-mark">
        M3 <span className="loading-mark-sep">//</span> UNLEASHED
      </div>
      <div className="loading-percent" aria-hidden="true">
        {displayPct >= 0 ? displayPct : "—"}
        <span className="loading-percent-unit">%</span>
      </div>
      <div className="loading-track" aria-hidden="true">
        <div className="loading-fill" style={{ transform: `scaleX(${displayPct >= 0 ? pct : 0})` }} />
      </div>
      <div className="loading-meta">
        {phase === "stalled" ? (
          <span className="loading-stalled">
            SEQUENCE STALLED —{" "}
            <button type="button" className="loading-continue" onClick={onContinue} data-cursor-hover>
              CONTINUE WITHOUT VIDEO
            </button>
          </span>
        ) : (
          <span>
            LOADING FRAME SEQUENCE — {ready} / {total > 0 ? total : "—"} FRAMES
          </span>
        )}
      </div>
    </div>
  );
}
