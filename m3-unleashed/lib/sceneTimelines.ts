/**
 * Scene DOM contract + scrubbed timeline builder — PRD Sections 11 & 13.
 *
 * Every scene's choreography is a single paused GSAP timeline whose progress
 * is set directly from scene-local scroll progress each frame (never a timer).
 * Position values on the timeline are fractions of scene progress.
 * Reverse scrubbing therefore requires no special code path (PRD 12.2 / 19.3).
 */

import gsap from "gsap";
import { Scene, SceneStat } from "./scenes";

export interface StatBinding {
  el: HTMLElement;
  valueEl: HTMLElement;
  stat: SceneStat;
  localIn: number; // scene-local progress window start
  localOut: number;
  counted: boolean;
}

export interface SceneEls {
  root: HTMLElement;
  primary: HTMLElement;
  secondary: HTMLElement | null;
  stats: StatBinding[];
  cta: HTMLElement | null;
  pointerLines: SVGLineElement[];
}

export function collectSceneEls(scenesLayer: HTMLElement, index: number, scene: Scene): SceneEls {
  const root = scenesLayer.querySelector<HTMLElement>(`[data-scene-index="${index}"]`);
  if (!root) throw new Error(`Scene ${index} element not found`);

  const primary = root.querySelector<HTMLElement>("[data-el='primary']");
  if (!primary) throw new Error(`Scene ${index} primary not found`);
  const secondary = root.querySelector<HTMLElement>("[data-el='secondary']");
  const cta = root.querySelector<HTMLElement>("[data-el='cta']");

  const [vs, ve] = scene.videoRange;
  const span = ve - vs;
  const stats: StatBinding[] = [];
  root.querySelectorAll<HTMLElement>("[data-el='stat']").forEach((el) => {
    const id = el.dataset.stat;
    const stat = scene.stats?.find((s) => s.id === id);
    const valueEl = el.querySelector<HTMLElement>("[data-el='stat-value']");
    if (!stat || !valueEl) return;
    stats.push({
      el,
      valueEl,
      stat,
      localIn: (stat.videoWindow[0] - vs) / span,
      localOut: (stat.videoWindow[1] - vs) / span,
      counted: false,
    });
  });

  const pointerLines = Array.from(root.querySelectorAll<SVGLineElement>("[data-el='pointer-line']"));

  return { root, primary, secondary, stats, cta, pointerLines };
}

export interface TimelineOptions {
  reduced: boolean;
  videoLayer?: HTMLElement | null; // scene 03 impact zoom target
  snap?: boolean; // mobile chapter-snap profile (half-magnitude impact zoom)
}

export function buildSceneTimeline(scene: Scene, els: SceneEls, opts: TimelineOptions): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: true, defaults: { ease: "none" } });
  const { reduced } = opts;
  const primaryTargets = [els.primary, els.secondary].filter(Boolean) as HTMLElement[];

  const fadeIn = (el: HTMLElement, at: number, dur = 0.3) => {
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power2.out" }, at);
  };
  const fadeOut = (targets: HTMLElement[] | HTMLElement, at: number, dur = 0.3) => {
    tl.to(targets, { opacity: 0, duration: dur, ease: "power2.in" }, at);
  };

  switch (scene.order) {
    case 1: {
      if (reduced) {
        fadeIn(els.primary, 0);
        if (els.secondary) fadeIn(els.secondary, 0.05);
      } else {
        tl.fromTo(
          els.primary,
          { letterSpacing: "0.4em", opacity: 0, filter: "blur(12px)" },
          { letterSpacing: "0.02em", opacity: 1, filter: "blur(0px)", duration: 0.15, ease: "power3.out" },
          0
        );
        if (els.secondary) {
          tl.fromTo(
            els.secondary,
            { opacity: 0, filter: "blur(8px)" },
            { opacity: 1, filter: "blur(0px)", duration: 0.12, ease: "power2.out" },
            0.06
          );
        }
      }
      tl.to(primaryTargets, { y: -40, opacity: 0, duration: 0.2, ease: "power2.in" }, 0.8);
      break;
    }

    case 2: {
      if (reduced) {
        fadeIn(els.primary, 0);
        if (els.secondary) fadeIn(els.secondary, 0.04);
      } else {
        tl.fromTo(
          primaryTargets,
          { opacity: 0, filter: "blur(8px)", x: 24 },
          { opacity: 1, filter: "blur(0px)", x: 0, duration: 0.15, ease: "power2.out" },
          0
        );
      }
      // Stats: opacity scrubbed across their scene-local windows
      for (const s of els.stats) {
        const win = Math.max(0.02, s.localOut - s.localIn);
        tl.fromTo(
          s.el,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: win * 0.25, ease: "power2.out" },
          s.localIn
        );
        tl.to(s.el, { opacity: 0, duration: win * 0.15, ease: "power1.in" }, s.localOut - win * 0.15);
      }
      // Pointer lines: draw 1:1 with progress across their video windows
      for (const line of els.pointerLines) {
        const [ws, we] = (
          line.dataset.window ? (JSON.parse(line.dataset.window) as [number, number]) : [0, 1]
        );
        const a = (ws - scene.videoRange[0]) / (scene.videoRange[1] - scene.videoRange[0]);
        const b = (we - scene.videoRange[0]) / (scene.videoRange[1] - scene.videoRange[0]);
        tl.fromTo(
          line,
          { strokeDashoffset: 1 },
          { strokeDashoffset: 0, duration: Math.max(0.01, b - a), ease: "none" },
          a
        );
      }
      // Fast exit so stats don't linger over the wheel macros
      tl.to(primaryTargets, { opacity: 0, duration: 0.15, ease: "power1.in" }, 0.85);
      break;
    }

    case 3: {
      if (opts.videoLayer && !reduced) {
        tl.fromTo(
          opts.videoLayer,
          { scale: opts.snap ? 1.02 : 1.04 },
          { scale: 1, duration: 0.15, ease: "power4.out" },
          0
        );
      }
      if (reduced) {
        tl.fromTo(els.primary, { opacity: 0 }, { opacity: 0.85, duration: 0.3, ease: "power2.out" }, 0);
        if (els.secondary) fadeIn(els.secondary, 0.05);
      } else {
        tl.fromTo(
          els.primary,
          { opacity: 0, filter: "blur(12px)", scale: 1.03 },
          { opacity: 0.85, filter: "blur(0px)", scale: 1, duration: 0.18, ease: "power3.out" },
          0
        );
        if (els.secondary) {
          tl.fromTo(
            els.secondary,
            { opacity: 0, filter: "blur(8px)" },
            { opacity: 1, filter: "blur(0px)", duration: 0.15, ease: "power2.out" },
            0.05
          );
        }
      }
      tl.to(primaryTargets, { y: -40, opacity: 0, duration: 0.2, ease: "power2.in" }, 0.8);
      break;
    }

    case 4: {
      if (reduced) {
        fadeIn(els.primary, 0);
      } else {
        tl.fromTo(
          els.primary,
          { opacity: 0, filter: "blur(12px)" },
          { opacity: 1, filter: "blur(0px)", duration: 0.15, ease: "power2.out" },
          0
        );
      }
      tl.to(els.primary, { y: -40, opacity: 0, duration: 0.2, ease: "power2.in" }, 0.8);
      break;
    }

    case 5: {
      // Slower entry: generous scroll room for the finale
      if (reduced) {
        fadeIn(els.primary, 0, 0.35);
      } else {
        tl.fromTo(
          els.primary,
          { letterSpacing: "0.25em", opacity: 0, filter: "blur(12px)" },
          { letterSpacing: "0.02em", opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "power3.out" },
          0
        );
      }
      if (els.secondary) fadeIn(els.secondary, 0.12);
      // CTA appears only in the final ~20% (video within its last ~0.6s)
      if (els.cta) {
        tl.fromTo(
          els.cta,
          { opacity: 0, y: 8 },
          { opacity: 1, y: 0, duration: 0.08, ease: "power2.out" },
          0.8
        );
      }
      // No exit: the lockup persists to the final frame; the pin releases around it
      break;
    }
  }

  return tl;
}

/** Event-based count-up (PRD 11 Scene 02): 0→final, 0.3s, re-triggerable. */
export function countUp(binding: StatBinding, reduced: boolean): void {
  const { valueEl, stat } = binding;
  const decimals = stat.decimals ?? 0;
  if (reduced) {
    valueEl.textContent = stat.value.toFixed(decimals);
    return;
  }
  const obj = { v: 0 };
  gsap.to(obj, {
    v: stat.value,
    duration: 0.3,
    ease: "power2.out",
    overwrite: true,
    onUpdate: () => {
      valueEl.textContent = obj.v.toFixed(decimals);
    },
  });
}
