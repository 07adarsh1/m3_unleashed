"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

/**
 * Desktop-only custom cursor (PRD 12.4). Joins the shared gsap.ticker loop —
 * position is lerped per tick (factor 0.15), never via React state.
 */
export default function CustomCursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches || window.innerWidth < 1024) return;
    const el = ref.current;
    if (!el) return;
    const label = el.querySelector<HTMLSpanElement>(".cursor-label");

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    let visible = false;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!visible) {
        visible = true;
        x = tx;
        y = ty;
        el.style.opacity = "1";
      }
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== "function") return;
      const hover = t.closest("[data-cursor-hover]");
      const labelled = t.closest("[data-cursor-label]");
      el.classList.toggle("expanded", !!hover || !!labelled);
      if (labelled) {
        if (label) label.textContent = labelled.getAttribute("data-cursor-label");
        el.classList.add("labelled");
      } else {
        el.classList.remove("labelled");
      }
    };
    const onLeave = () => {
      visible = false;
      el.style.opacity = "0";
    };
    const update = () => {
      x += (tx - x) * 0.15;
      y += (ty - y) * 0.15;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };

    gsap.ticker.add(update);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseover", onOver, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      gsap.ticker.remove(update);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="custom-cursor" ref={ref} aria-hidden="true">
      <div className="cursor-dot">
        <span className="cursor-label" />
      </div>
    </div>
  );
}
