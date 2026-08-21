/**
 * Mobile chapter-snap controller — PRD Section 21.
 * Five full-viewport scroll-snapped sections; each plays a short pre-trimmed
 * looping clip while in view (IntersectionObserver + muted/playsinline only).
 * Typography remains scroll-scrubbed per section — only the video mechanic
 * differs from desktop.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SCENES } from "./scenes";
import { SceneEls, buildSceneTimeline, collectSceneEls, countUp } from "./sceneTimelines";
import { track } from "./analytics";
import { uiRefs } from "./ui";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export interface SnapControllerOptions {
  root: HTMLElement;
  sections: HTMLElement[];
  reduced: boolean;
  initialScene: number;
  onSceneChange: (index: number) => void;
  onReady: () => void;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class SnapController {
  private opts: SnapControllerOptions;
  private io: IntersectionObserver | null = null;
  private triggers: ScrollTrigger[] = [];
  private timelines: gsap.core.Timeline[] = [];
  private sceneEls: SceneEls[] = [];
  private active = -1;
  private destroyed = false;
  private completeTracked = false;
  private videos: HTMLVideoElement[] = [];

  constructor(opts: SnapControllerOptions) {
    this.opts = opts;
  }

  init(): void {
    const o = this.opts;
    try {
      document.documentElement.classList.add("snap-mode");

      this.sceneEls = SCENES.map((s, i) => collectSceneEls(o.sections[i], i, s));
      this.timelines = SCENES.map((s, i) =>
        buildSceneTimeline(s, this.sceneEls[i], {
          reduced: o.reduced,
          videoLayer: o.sections[i].querySelector<HTMLElement>("[data-el='video-layer']"),
          snap: true,
        })
      );

      this.videos = o.sections
        .map((sec) => sec.querySelector<HTMLVideoElement>("video"))
        .filter((v): v is HTMLVideoElement => !!v);

      // Text choreography scrubbed by each section's transit progress
      o.sections.forEach((sec, i) => {
        this.triggers.push(
          ScrollTrigger.create({
            trigger: sec,
            start: "top bottom",
            end: "bottom top",
            onUpdate: (self) => {
              this.timelines[i]?.progress(self.progress);
              if (i === 0) {
                const prompt = sec.querySelector<HTMLElement>("[data-el='swipe-prompt']");
                if (prompt) prompt.style.opacity = String(clamp01(1 - self.progress * 5));
              }
            },
          })
        );
      });

      // Top progress bar + 01/05 readout across the whole chapter block
      this.triggers.push(
        ScrollTrigger.create({
          trigger: o.root,
          start: "top top",
          end: "bottom bottom",
          onUpdate: (self) => {
            if (uiRefs.mobileProgress) uiRefs.mobileProgress.style.transform = `scaleX(${self.progress})`;
            if (uiRefs.mobileLabel && this.active >= 0) {
              uiRefs.mobileLabel.textContent = `0${this.active + 1} / 05`;
            }
          },
        })
      );

      // Clip autoplay per section (respect reduced motion: no autoplay)
      this.io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const i = o.sections.indexOf(entry.target as HTMLElement);
            if (i < 0) continue;
            const video = this.videos[i];
            if (entry.isIntersecting) {
              this.activate(i);
              if (video && !o.reduced) {
                video.play().catch(() => undefined);
              }
            } else if (video) {
              video.pause();
            }
          }
        },
        { threshold: 0.6 }
      );
      o.sections.forEach((sec) => this.io?.observe(sec));

      // Restore preserved scene across a mode switch (PRD 21.4)
      if (o.initialScene > 0) {
        requestAnimationFrame(() => {
          if (!this.destroyed) {
            o.sections[Math.min(o.initialScene, o.sections.length - 1)].scrollIntoView({ behavior: "auto" });
          }
        });
      }

      track("mode", { mode: o.reduced ? "mobile-snap-reduced" : "mobile-snap" });
      o.onReady();
    } catch (err) {
      console.error("[M3] SnapController init failed", err);
      track("controller_error", { message: String(err) });
      o.onReady();
    }
  }

  private activate(index: number): void {
    if (index === this.active) return;
    this.active = index;
    this.opts.onSceneChange(index);
    track("scene_enter", { index });
    if (index === 4 && !this.completeTracked) {
      this.completeTracked = true;
      track("experience_complete", { mode: "mobile-snap" });
    }
    // Trigger stat count-ups for the entering chapter
    if (index === 1) {
      for (const s of this.sceneEls[1].stats) {
        s.counted = true;
        countUp(s, this.opts.reduced);
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.io?.disconnect();
    this.triggers.forEach((t) => t.kill());
    this.timelines.forEach((tl) => tl.kill());
    this.videos.forEach((v) => v.pause());
    document.documentElement.classList.remove("snap-mode");
    if (uiRefs.mobileProgress) uiRefs.mobileProgress.style.transform = "scaleX(0)";
  }
}
