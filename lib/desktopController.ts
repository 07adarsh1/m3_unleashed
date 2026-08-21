/**
 * Desktop continuous scroll-scrub controller — PRD Sections 9, 12.1, 19.
 *
 * Single source of truth: this class owns the one rAF (gsap.ticker) loop.
 * Video frame, scene timelines, indicator fill, nav opacity, prompt, stats
 * and the velocity trail are ALL derived from one resolved lerped progress
 * value per frame (PRD 19.1 non-negotiable rule).
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { PIN_VIEWPORTS, SCENES, VIDEO_DURATION } from "./scenes";
import { resolveProgress, SCENE_STARTS } from "./timeline";
import { CanvasRenderer, FrameStore, LoadProgress } from "./frames";
import { SceneEls, buildSceneTimeline, collectSceneEls, countUp } from "./sceneTimelines";
import { track } from "./analytics";
import { scrollBus, uiRefs } from "./ui";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export interface DesktopControllerOptions {
  root: HTMLElement;
  videoLayer: HTMLElement;
  canvas: HTMLCanvasElement;
  poster: HTMLImageElement;
  scenesLayer: HTMLElement;
  prompt: HTMLElement;
  trail: HTMLElement | null;
  frameSet: "d" | "m";
  reduced: boolean;
  initialScene: number;
  onLoadingUpdate: (p: LoadProgress) => void;
  onStall: () => void;
  onReady: () => void;
  onSceneChange: (index: number) => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class DesktopController {
  private opts: DesktopControllerOptions;
  private lenis: Lenis | null = null;
  private st: ScrollTrigger | null = null;
  private store: FrameStore | null = null;
  private renderer = new CanvasRenderer();
  private sceneEls: SceneEls[] = [];
  private timelines: gsap.core.Timeline[] = [];
  private raw = 0;
  private lerped = 0;
  private active = -1;
  private lastDrawn = -1;
  private pendingIdx = -1;
  private promptGone = false;
  private posterMode = false;
  private began = false;
  private destroyed = false;
  private smoothedVel = 0;
  private readyAt = 0;
  private firstScrollTracked = false;
  private maxProgress = 0;
  private reverseTracked = false;
  private completeTracked = false;
  private resizeHandler = () => this.onResize();
  private tickFn = (time: number, deltaTime: number) => this.tick(time, deltaTime);

  constructor(opts: DesktopControllerOptions) {
    this.opts = opts;
  }

  async init(): Promise<void> {
    const o = this.opts;
    try {
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      window.scrollTo(0, 0);

      try {
        this.lenis = new Lenis({ autoRaf: false });
        this.lenis.on("scroll", ScrollTrigger.update);
        this.lenis.stop(); // locked until the loader gate passes
        scrollBus.set((target, opts2) => {
          if (this.lenis) {
            this.lenis.scrollTo(target as never, {
              duration: opts2?.duration ?? 1.4,
              immediate: opts2?.immediate,
            });
          } else if (typeof target === "number") {
            window.scrollTo({ top: target });
          } else {
            document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
          }
        });
      } catch {
        // Native scroll still works with ScrollTrigger alone
      }

      this.st = ScrollTrigger.create({
        trigger: o.root,
        start: "top top",
        end: () => `+=${window.innerHeight * PIN_VIEWPORTS}`,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          this.raw = self.progress;
        },
        onToggle: (self) => {
          if (uiRefs.indicatorRoot) {
            uiRefs.indicatorRoot.style.opacity = self.isActive ? "1" : "0";
            uiRefs.indicatorRoot.style.pointerEvents = self.isActive ? "auto" : "none";
          }
        },
      });

      // Scene DOM + timelines
      this.sceneEls = SCENES.map((s, i) => collectSceneEls(o.scenesLayer, i, s));
      this.timelines = SCENES.map((s, i) =>
        buildSceneTimeline(s, this.sceneEls[i], {
          reduced: o.reduced || this.posterMode,
          videoLayer: o.videoLayer,
        })
      );

      this.renderer.attach(o.canvas);
      window.addEventListener("resize", this.resizeHandler);

      // Restore a preserved scene across a breakpoint mode switch (PRD 21.4)
      if (o.initialScene > 0) {
        const i = Math.min(o.initialScene, SCENES.length - 1);
        const p = SCENE_STARTS[i] + SCENES[i].scrollWeight * 0.5;
        const y = (this.st?.start ?? 0) + p * ((this.st?.end ?? 0) - (this.st?.start ?? 0));
        window.scrollTo(0, y);
        this.raw = p;
        this.lerped = p;
      }

      if (this.destroyed) return;

      // Path A frame sequence (skipped when canvas is unusable → poster fallback).
      // Decoded frames live in a bounded LRU cache — see FrameStore.
      this.store = new FrameStore("/frames/manifest.json", o.frameSet, 24);
      this.store.onProgress = (p) => {
        if (!this.destroyed) o.onLoadingUpdate(p);
      };
      this.store.onStall = () => {
        if (!this.destroyed && !this.began) o.onStall();
      };
      const loadPromise = this.store.load();
      await this.store.waitGate();
      if (this.destroyed) return;
      loadPromise.catch(() => undefined); // background completion; errors degrade to held frames

      this.begin();
    } catch (err) {
      console.error("[M3] ScrollController init failed, entering poster fallback", err);
      track("controller_error", { message: String(err) });
      this.enterPosterMode();
      this.begin();
    }
  }

  private begin(): void {
    if (this.began || this.destroyed) return;
    this.began = true;
    this.lenis?.start();
    this.opts.onReady();
    this.readyAt = performance.now();
    gsap.ticker.add(this.tickFn);
    gsap.ticker.lagSmoothing(0);
    track("mode", { mode: this.posterMode ? "desktop-poster-fallback" : "desktop-scrub" });
    if (this.store && this.store.decoded >= 24) {
      track("loader_gate_passed", { frames: this.store.decoded, fetched: this.store.fetched, total: this.store.totalCount });
    }
    this.tick(0, 16.7); // prime initial state
  }

  /** Static-poster fallback (PRD Section 24): simplified fades, no frame sequence. */
  enterPosterMode(): void {
    if (this.posterMode) return;
    this.posterMode = true;
    this.store?.skipGate();
    this.opts.canvas.style.display = "none";
    this.opts.poster.style.display = "block";
    // Rebuild choreography with reduced (fade-only) primitives
    this.timelines.forEach((tl) => tl.kill());
    const scroll = this.lerped;
    this.timelines = SCENES.map((s, i) =>
      buildSceneTimeline(s, this.sceneEls[i], { reduced: true, videoLayer: this.opts.videoLayer })
    );
    // Restore progress state after rebuild
    const r = resolveProgress(scroll);
    this.timelines[r.sceneIndex]?.progress(r.sceneProgress);
  }

  scrollToChapter(index: number): void {
    const st = this.st;
    if (!st) return;
    const p = SCENE_STARTS[index] + SCENES[index].scrollWeight * 0.5;
    const y = st.start + p * (st.end - st.start);
    if (this.lenis) {
      this.lenis.scrollTo(y, { duration: 1.2 });
    } else {
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }

  private onResize(): void {
    if (this.destroyed) return;
    this.renderer.resize();
  }

  private tick(time: number, deltaTime: number): void {
    if (this.destroyed) return;
    this.lenis?.raf(time * 1000);

    // Frame-rate-independent lerp toward raw progress (PRD 19.1 step 3).
    // 0.14 keeps scroll-feel snappy while still absorbing raw wheel jitter.
    const S = this.opts.reduced ? 0.3 : 0.14;
    const steps = Math.max(1, Math.min(deltaTime, 100) / 16.667);
    const k = 1 - Math.pow(1 - S, steps);
    this.lerped += (this.raw - this.lerped) * k;
    if (Math.abs(this.raw - this.lerped) < 0.00005) this.lerped = this.raw;

    const r = resolveProgress(this.lerped);

    if (r.sceneIndex !== this.active) this.activate(r.sceneIndex);

    // Video frame — LRU-cached blit; decode on demand + directional prefetch
    if (!this.posterMode && this.store) {
      const idx = this.store.nearestIndex(r.videoTime);
      if (idx >= 0) {
        if (idx !== this.lastDrawn) {
          const img = this.store.peek(idx);
          if (img) {
            this.renderer.draw(img);
            this.lastDrawn = idx;
          } else if (idx !== this.pendingIdx) {
            // On-screen miss: decode now; draw when ready if still relevant
            this.pendingIdx = idx;
            this.store
              .ensure(idx)
              .then((img2) => {
                if (img2 && !this.destroyed && idx === this.pendingIdx) {
                  this.renderer.draw(img2);
                  this.lastDrawn = idx;
                }
              })
              .catch(() => undefined);
          }
        }
        const dir = this.lenis ? Math.sign(this.lenis.velocity) || 1 : 1;
        this.store.prefetch(idx, dir);
      }
    }

    // Scene choreography from the SAME resolved value
    this.timelines[r.sceneIndex]?.progress(r.sceneProgress);

    // Scene 05 CTA becomes interactive only in the final stretch
    const cta = this.sceneEls[4]?.cta;
    if (cta) {
      cta.style.pointerEvents = r.sceneIndex === 4 && r.sceneProgress >= 0.8 ? "auto" : "none";
    }

    this.updatePrompt(r.globalProgress);
    this.updateChrome(r.globalProgress, r.sceneIndex);
    this.updateStats(r.sceneIndex, r.sceneProgress);
    this.updateTrail(deltaTime, r.sceneIndex);
    this.updateAnalytics(r.globalProgress);
  }

  private activate(index: number): void {
    if (this.active >= 0 && this.sceneEls[this.active]) {
      gsap.set(this.sceneEls[this.active].root, { visibility: "hidden" });
    }
    this.active = index;
    if (this.sceneEls[index]) {
      gsap.set(this.sceneEls[index].root, { visibility: "visible" });
    }
    this.opts.onSceneChange(index);
    track("scene_enter", { index });
  }

  private updatePrompt(g: number): void {
    const el = this.opts.prompt;
    if (this.promptGone || !el) return;
    const o = clamp01(1 - (g - 0.03) / 0.02);
    el.style.opacity = String(o);
    if (g > 0.05) {
      this.promptGone = true;
      el.style.opacity = "0";
    }
  }

  private updateChrome(g: number, sceneIndex: number): void {
    // Chapter indicator fill — continuous readout of global progress
    if (uiRefs.indicatorFill) {
      uiRefs.indicatorFill.style.transform = `scaleY(${g})`;
    }
    // Nav dims while the active scene's primary type is dominant (PRD 12.6)
    if (uiRefs.navLinks && sceneIndex >= 0 && this.sceneEls[sceneIndex]) {
      const op = Number(gsap.getProperty(this.sceneEls[sceneIndex].primary, "opacity")) || 0;
      const nav = clamp01(1 - (op - 0.6) * 1.5);
      uiRefs.navLinks.style.opacity = String(Math.max(0.4, nav));
    }
  }

  private updateStats(sceneIndex: number, local: number): void {
    if (sceneIndex !== 1) return;
    for (const s of this.sceneEls[1].stats) {
      const inWindow = local >= s.localIn && local <= s.localOut + 0.02;
      if (inWindow && !s.counted) {
        s.counted = true;
        countUp(s, this.opts.reduced || this.posterMode);
      } else if (!inWindow) {
        s.counted = false;
      }
    }
  }

  private updateTrail(deltaTime: number, sceneIndex: number): void {
    const el = this.opts.trail;
    if (!el) return;
    const v = this.lenis ? Math.abs(this.lenis.velocity) : 0;
    const target = sceneIndex === 2 && !this.opts.reduced ? Math.min(1, v / 90) : 0;
    if (target > this.smoothedVel) {
      this.smoothedVel += (target - this.smoothedVel) * (1 - Math.pow(0.5, deltaTime / 60));
    } else {
      // 200ms half-life decay so the trail doesn't snap off (PRD 13.3)
      this.smoothedVel *= Math.pow(0.5, deltaTime / 200);
    }
    const dir = this.lenis && this.lenis.velocity < 0 ? -1 : 1;
    el.style.opacity = (this.smoothedVel * 0.35).toFixed(3);
    el.style.transform = `scaleX(${dir})`;
  }

  private updateAnalytics(g: number): void {
    if (!this.firstScrollTracked && this.readyAt && g > 0.002) {
      this.firstScrollTracked = true;
      track("first_scroll", { msSinceReady: Math.round(performance.now() - this.readyAt) });
    }
    if (g > this.maxProgress) this.maxProgress = g;
    if (!this.reverseTracked && this.maxProgress - g > 0.01) {
      this.reverseTracked = true;
      track("reverse_scroll", { at: g.toFixed(3) });
    }
    if (!this.completeTracked && g >= 0.995) {
      this.completeTracked = true;
      track("experience_complete", { maxProgress: this.maxProgress });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.store?.abort();
    gsap.ticker.remove(this.tickFn);
    window.removeEventListener("resize", this.resizeHandler);
    this.timelines.forEach((tl) => tl.kill());
    this.st?.kill();
    this.lenis?.destroy();
    scrollBus.clear();
    if (uiRefs.navLinks) uiRefs.navLinks.style.opacity = "1";
    if (uiRefs.indicatorRoot) {
      uiRefs.indicatorRoot.style.opacity = "0";
      uiRefs.indicatorRoot.style.pointerEvents = "none";
    }
  }
}

export { VIDEO_DURATION };
