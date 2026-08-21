"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { SCENES, Scene } from "@/lib/scenes";
import { DesktopController } from "@/lib/desktopController";
import { SnapController } from "@/lib/snapController";
import { LoadProgress } from "@/lib/frames";
import { track } from "@/lib/analytics";
import { uiRefs } from "@/lib/ui";
import SceneContent from "./SceneContent";
import LoadingScreen from "./LoadingScreen";
import ChapterIndicator from "./ChapterIndicator";
import CustomCursor from "./CustomCursor";

type Mode = "desktop" | "snap";

interface LoadState {
  phase: "loading" | "active" | "stalled";
  pct: number;
  ready: number;
  total: number;
}

/**
 * Owns the pin/scrub container (PRD Section 17). Chooses the interaction mode
 * from viewport + capability (PRD 21.3), preserves the active scene across a
 * mode switch (PRD 21.4), and renders the shared loading screen.
 */
export default function CinematicExperience() {
  // 'desktop' initial so scene copy exists in the SSR'd HTML (PRD Section 26)
  const [mode, setMode] = useState<Mode>("desktop");
  const [modeConfirmed, setModeConfirmed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [load, setLoad] = useState<LoadState>({ phase: "loading", pct: 0, ready: 0, total: 0 });
  const [sceneIndex, setSceneIndex] = useState(0);

  const rootRef = useRef<HTMLElement | null>(null);
  const videoLayerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
  const scenesLayerRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const snapSectionsRef = useRef<HTMLElement[]>([]);
  const ctrlRef = useRef<DesktopController | SnapController | null>(null);
  const sceneIndexRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      track("reduced_motion", { enabled: mq.matches });
      setReduced(mq.matches);
    };
    if (mq.matches) apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Mode detection + re-detection on breakpoint crossing (PRD 21.3 / 21.4)
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      let canvasOk = false;
      try {
        canvasOk =
          !!document.createElement("canvas").getContext("2d") && typeof createImageBitmap !== "undefined";
      } catch {
        canvasOk = false;
      }
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
      const scrub = canvasOk && (w >= 1024 || (w >= 768 && mem >= 4));
      setMode((prev) => (prev === (scrub ? "desktop" : "snap") ? prev : scrub ? "desktop" : "snap"));
    };
    compute();
    setModeConfirmed(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(compute, 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Real loading progress, throttled to ~10 updates/s
  const throttleRef = useRef(0);
  const onLoadingUpdate = useCallback((p: LoadProgress) => {
    const now = performance.now();
    if (now - throttleRef.current < 100 && p.ready < p.total) return;
    throttleRef.current = now;
    setLoad({ phase: "loading", pct: p.pct, ready: p.ready, total: p.total });
  }, []);

  const onSceneChange = useCallback((i: number) => {
    sceneIndexRef.current = i;
    setSceneIndex(i);
  }, []);

  // Desktop: continuous scroll-scrub (Path A canvas sequence)
  useEffect(() => {
    if (mode !== "desktop") return;
    const root = rootRef.current;
    const videoLayer = videoLayerRef.current;
    const canvas = canvasRef.current;
    const poster = posterRef.current;
    const scenesLayer = scenesLayerRef.current;
    const prompt = promptRef.current;
    if (!root || !videoLayer || !canvas || !poster || !scenesLayer || !prompt) return;

    const frameSet = window.innerWidth >= 1280 ? "d" : "m";
    const controller = new DesktopController({
      root,
      videoLayer,
      canvas,
      poster,
      scenesLayer,
      prompt,
      trail: trailRef.current,
      frameSet,
      reduced,
      initialScene: sceneIndexRef.current,
      onLoadingUpdate,
      onStall: () => setLoad((s) => (s.phase === "loading" ? { ...s, phase: "stalled" } : s)),
      onReady: () => setLoad((s) => (s.phase === "active" ? s : { ...s, phase: "active" })),
      onSceneChange,
    });
    ctrlRef.current = controller;
    controller.init();
    return () => {
      controller.destroy();
      ctrlRef.current = null;
    };
  }, [mode, reduced, onLoadingUpdate, onSceneChange]);

  // Mobile: chapter-snap mode
  useEffect(() => {
    if (mode !== "snap") return;
    const root = rootRef.current;
    const sections = snapSectionsRef.current.filter(Boolean);
    if (!root || sections.length !== SCENES.length) return;
    const controller = new SnapController({
      root,
      sections,
      reduced,
      initialScene: sceneIndexRef.current,
      onSceneChange,
      onReady: () => setLoad((s) => (s.phase === "active" ? s : { ...s, phase: "active" })),
    });
    ctrlRef.current = controller;
    controller.init();
    return () => {
      controller.destroy();
      ctrlRef.current = null;
    };
  }, [mode, reduced, onSceneChange]);

  const onChapterSelect = useCallback((i: number) => {
    const c = ctrlRef.current;
    if (c instanceof DesktopController) c.scrollToChapter(i);
  }, []);

  const onContinueWithoutVideo = useCallback(() => {
    track("continue_without_video");
    const c = ctrlRef.current;
    if (c instanceof DesktopController) c.enterPosterMode();
    setLoad((s) => ({ ...s, phase: "active" }));
  }, []);

  return (
    <section
      id="cinematic"
      ref={(el) => {
        rootRef.current = el;
      }}
      className={`cinematic mode-${mode}`}
      aria-label="BMW M3 Competition — scroll-controlled film"
    >
      {mode === "desktop" ? (
        <>
          <div ref={videoLayerRef} className="video-layer">
            <canvas ref={canvasRef} className="video-canvas" aria-hidden="true" />
            <img
              ref={posterRef}
              className="video-poster"
              src="/still/hero-poster.jpg"
              alt=""
              aria-hidden="true"
              style={{ display: "none" }}
            />
            <div ref={trailRef} className="velocity-trail" aria-hidden="true" />
          </div>
          <div ref={scenesLayerRef} className="scenes-layer">
            {SCENES.map((s, i) => (
              <SceneContent key={s.id} scene={s} index={i} variant="desktop" />
            ))}
          </div>
          <div ref={promptRef} className="scroll-prompt" aria-hidden="true">
            <span className="scroll-prompt-text">SCROLL TO EXPERIENCE</span>
            <span className="scroll-prompt-line" />
          </div>
          <ChapterIndicator scenes={SCENES} activeIndex={sceneIndex} onSelect={onChapterSelect} />
          <CustomCursor />
        </>
      ) : (
        <>
          <MobileChapters scenes={SCENES} reduced={reduced} sectionRefs={snapSectionsRef} />
          <MobileChrome activeIndex={sceneIndex} />
        </>
      )}
      <LoadingScreen
        phase={load.phase}
        pct={load.pct}
        ready={load.ready}
        total={load.total}
        onContinue={onContinueWithoutVideo}
      />
      <div className={`boot-shade${modeConfirmed ? " settled" : ""}`} aria-hidden="true" />
    </section>
  );
}

function MobileChapters({
  scenes,
  reduced,
  sectionRefs,
}: {
  scenes: Scene[];
  reduced: boolean;
  sectionRefs: RefObject<HTMLElement[]>;
}) {
  return (
    <div className="snap-wrap">
      {scenes.map((scene, i) => (
        <section
          key={scene.id}
          className="snap-section"
          aria-label={`Chapter ${scene.order} — ${scene.title}`}
          ref={(el) => {
            if (el) sectionRefs.current[i] = el;
          }}
        >
          <div className="video-layer snap-video-layer" data-el="video-layer">
            <video
              className="snap-video"
              src={`/video/scene-0${i + 1}.mp4`}
              poster={`/still/scene-0${i + 1}-poster.jpg`}
              muted
              loop
              playsInline
              preload={reduced ? "none" : i === 0 ? "auto" : "metadata"}
              aria-hidden="true"
              {...(reduced ? { controls: true } : {})}
            />
          </div>
          <SceneContent scene={scene} index={i} variant="snap" />
        </section>
      ))}
    </div>
  );
}

function MobileChrome({ activeIndex }: { activeIndex: number }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    uiRefs.mobileProgress = barRef.current;
    uiRefs.mobileLabel = labelRef.current;
    return () => {
      uiRefs.mobileProgress = null;
      uiRefs.mobileLabel = null;
    };
  }, []);

  return (
    <div className="mobile-chrome" aria-hidden="true">
      <div className="mobile-progress-track">
        <div ref={barRef} className="mobile-progress-fill" />
      </div>
      <div ref={labelRef} className="mobile-chapter-label">
        0{activeIndex + 1} / 05
      </div>
    </div>
  );
}
