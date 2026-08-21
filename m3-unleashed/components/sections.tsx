"use client";

import gsap from "gsap";
import { ReactNode, useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

/** Intersection-triggered reveal — event-based, outside the scrub hot path. */
function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add("in");
            io.disconnect();
          }
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}

/** Count-up stat block for the Performance section. */
function PerfStat({ value, unit, decimals = 0, label }: { value: number; unit: string; decimals?: number; label: string }) {
  const valueRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = valueRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.disconnect();
          if (reduced) {
            el.textContent = value.toFixed(decimals);
            return;
          }
          const obj = { v: 0 };
          gsap.to(obj, {
            v: value,
            duration: 1.1,
            ease: "power2.out",
            onUpdate: () => {
              el.textContent = obj.v.toFixed(decimals);
            },
          });
        }
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, decimals]);
  return (
    <div className="perf-stat">
      <span className="perf-stat-numeral">
        <span className="perf-stat-value" ref={valueRef}>
          0
        </span>
        <span className="perf-stat-unit">{unit}</span>
      </span>
      <span className="perf-stat-label">{label}</span>
    </div>
  );
}

export function PerformanceSection() {
  return (
    <section id="performance" className="section performance" aria-labelledby="performance-title">
      <Reveal>
        <p className="section-kicker">01 — POWERTRAIN</p>
        <h2 id="performance-title" className="section-title">
          PERFORMANCE,
          <br />
          QUANTIFIED.
        </h2>
      </Reveal>
      <Reveal className="mt-16">
        <div className="perf-grid">
          <PerfStat value={510} unit="HP" label="M TwinPower Turbo inline-six" />
          <PerfStat value={650} unit="NM" label="Peak torque" />
          <PerfStat value={3.5} unit="S" decimals={1} label="0–100 km/h" />
        </div>
      </Reveal>
      <Reveal className="mt-16">
        <p className="section-copy">
          A single twin-turbocharged inline-six, bred in the M division and delivering its output through an
          eight-speed M Steptronic transmission. The numbers are the anchor; the film you just drove through is
          what they feel like.
        </p>
      </Reveal>
    </section>
  );
}

export function DesignSection() {
  const stills: Array<[string, string, string]> = [
    ["/still/design-1.jpg", "Ignition in the structure", "Headlights carve through the parking deck's darkness."],
    ["/still/design-2.jpg", "Engineered detail", "The M brake caliper, held in frame long enough to be read."],
    ["/still/design-3.jpg", "The cold finish", "First frost on the forest road — the film's final act."],
  ];
  return (
    <section id="design" className="section design" aria-labelledby="design-title">
      <Reveal>
        <p className="section-kicker">02 — CINEMATOGRAPHY</p>
        <h2 id="design-title" className="section-title">
          SHOT LIKE
          <br />
          A CHARACTER.
        </h2>
      </Reveal>
      <Reveal className="mt-16">
        <div className="stills-grid">
          {stills.map(([src, title, caption]) => (
            <figure className="still-figure" key={src}>
              <img src={src} alt={caption} loading="lazy" decoding="async" />
              <figcaption>
                <span className="still-title">{title}</span>
                <span className="still-caption">{caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

export function MPowerSection() {
  return (
    <section id="m-power" className="section m-power" aria-labelledby="m-power-title">
      <Reveal>
        <p className="section-kicker">03 — HERITAGE</p>
        <h2 id="m-power-title" className="section-title">
          THE MOST
          <br />
          POWERFUL LETTER.
        </h2>
        <div className="accent-rule" aria-hidden="true" />
        <p className="section-copy">
          Since 1972, the M division has existed for one purpose: motorsport engineering distilled into road
          cars. The M3 Competition carries that lineage in its throttle mapping, its cooling, its chassis —
          and in the way it moves a camera.
        </p>
      </Reveal>
    </section>
  );
}

export function FinalCTASection() {
  return (
    <section className="section final-cta" aria-labelledby="final-cta-title">
      <Reveal>
        <h2 id="final-cta-title" className="final-cta-title">
          UNLEASH IT
          <br />
          YOURSELF.
        </h2>
        <a
          className="final-cta-button"
          href="https://www.bmw.com/m3"
          target="_blank"
          rel="noopener noreferrer"
          data-cursor-hover
          onClick={() => track("external_cta_click", { target: "bmw.com/m3" })}
        >
          BUILD YOURS AT BMW.COM
        </a>
        <a className="final-cta-secondary" href="/video/master.mp4" target="_blank" rel="noopener noreferrer" data-cursor-hover>
          WATCH THE FILM →
        </a>
      </Reveal>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-left">
        <span className="footer-mark">
          M3 <span>//</span> UNLEASHED
        </span>
        <span className="footer-note">SCROLL = THROTTLE</span>
      </div>
      <div className="footer-right">
        <span>
          Film: “BMW M3 Competition — 4K Cinematic Short Video” by Damir Who. Editorial/interactive demo — not
          affiliated with BMW AG.
        </span>
        <span>Built with Next.js, GSAP ScrollTrigger &amp; Lenis.</span>
      </div>
    </footer>
  );
}
