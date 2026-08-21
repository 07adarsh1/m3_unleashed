# M3 // UNLEASHED

A scroll-driven cinematic microsite built around the BMW M3 Competition short film
(*"BMW M3 Competition — 4K Cinematic Short Video" by Damir Who*, 33.375s, 24fps, 1080p).

**The core mechanic: SCROLL = THROTTLE.** Scroll position — not autoplay, not a timer — is the
only thing that advances the film. Scrolling down drives forward through the film; scrolling up
reverses it frame-accurately. Typography, statistics, and UI choreography are bound to the same
timeline, synchronized to specific frames.

Implemented from the PRD (`M3-UNLEASHED-PRD.md`) — the five chapters, timecodes, scroll
weighting, and mobile strategy all derive from the film's actual shot structure.

## Quick start

```bash
npm install          # dependencies
npm run assets       # one-time: extract frame sequence, clips, stills from assets/master.mp4
npm run build        # static export to out/
npm start            # serve out/ at http://localhost:4173
```

Requires Node 18+ and `ffmpeg` on PATH (frame pipeline). Place the source film at
`assets/master.mp4` before running `npm run assets` (already done in this workspace).

Dev server: `npm run dev`. Headless QA: `node scripts/smoke.mjs` (Playwright, uses system Edge;
run against the served build — set `URL=` if the port differs).

## How it works

### Scroll → frame sync (the heart)

The source file's ~1.75s keyframe interval makes naive `video.currentTime` scrubbing stutter.
So the interactive master is a **pre-extracted WebP frame sequence** (PRD §19.2 Path A):

- 447 frames — 12fps base, **18fps across the 16.5–24s drift window** where motion is fastest,
  plus an exact final frame at t=33.375s so progress=1 lands on the film's true last frame.
- Two widths: `d/` (1920w) and `m/` (960w), selected by viewport.
- `public/frames/manifest.json` maps frame index → timecode; the renderer picks the nearest
  frame by binary search and blits it to a canvas. Zero seek/decode latency per frame.
- **Bounded memory:** compressed Blobs for the whole sequence stay in RAM (~27MB), but only a
  small LRU window of decoded frames (~40) is kept alive — decoding all 447 full-size bitmaps
  would cost ~3.5GB. Scroll-direction prefetch (14 ahead / 6 behind) keeps playback ahead of
  the playhead; on-screen misses decode on demand in ~15ms.

A single `gsap.ticker` rAF loop owns everything (PRD §19.1): Lenis scroll → raw progress →
lerped progress (smoothing 0.10) → scene resolution → **one** resolved value drives the canvas
frame, the scene timelines, the chapter indicator, nav opacity, stat count-ups, and the
velocity trail. No React state updates in the hot path — only direct DOM/canvas writes.

Scene choreography is built as paused GSAP timelines whose `.progress()` is set from
scene-local scroll progress each frame — so reverse scrubbing needs no separate code path.

### Five chapters (from the film's real cut points)

| # | Chapter | Video range | Scroll weight | Signature |
|---|---|---|---|---|
| 01 | THE ARRIVAL | 0–9.5s | 25% | Garage darkness, letter-spacing contraction entry |
| 02 | THE DETAILS | 9.5–16.5s | 20% | Badge/wheel pointer lines, stat count-ups (510 HP / 650 Nm / 3.5s) |
| 03 | THE MACHINE | 16.5–24s | 22% | Drift peak: impact zoom, velocity-reactive trail, 2x indicator pulse |
| 04 | THE ROAD | 24–30.5s | 18% | The exhale — right-anchored, smaller type |
| 05 | THE ESCAPE | 30.5–33.375s | 15% | Frost finale, final lockup, CTA in the last 20% |

All content, timing, and animation parameters live in the typed scene config
(`lib/scenes.ts`) — reconfiguring a chapter is a data edit, not a code change.

### Mobile: chapter-snap, not a degraded desktop

iOS restricts high-frequency programmatic seeking, so <768px (and capability-detected tablets)
get five full-viewport scroll-snapped sections, each with a pre-trimmed looping clip
(`public/video/scene-0N.mp4`, muted + playsinline + IntersectionObserver play/pause).
Typography remains scroll-scrubbed — only the video mechanic changes. Crossing a breakpoint
mid-session tears down and re-initializes the right mode, preserving the active chapter.

### Resilience

Real-bytes loading progress gated on the first 24 frames; 15s stall offers "Continue without
video" → static-poster fallback with fade-only transitions; canvas/WebP unsupported → Path B
native video; controller init errors fail safe to the poster fallback; refresh resets to top
(`scrollRestoration = 'manual'`).

### Accessibility

Real heading structure, skip-link as first tab stop, screen-reader transcript of all chapters
(the visual scenes are opacity-managed), keyboard-scrollable scrub, visible focus states,
`prefers-reduced-motion` simplification (opacity-only, no zoom/blur/trail, poster + tap-to-play
on mobile) that keeps full content access.

## Project map

```
app/                layout (fonts, SEO, JSON-LD), page (SSR shell + sections), globals.css (design system)
lib/
  scenes.ts         data-driven scene config (PRD §20) — single source of truth for timing/copy
  timeline.ts       piecewise progress → scene → video-time resolution (PRD §11/§19)
  frames.ts         FrameLoader (progressive decode, gate, stall) + CanvasRenderer (cover blit)
  sceneTimelines.ts scrubbed timeline builder per scene + count-up (PRD §11/§13)
  desktopController.ts  pin + Lenis + single rAF loop + chrome writes (PRD §19.1)
  snapController.ts mobile chapter-snap (PRD §21)
  analytics.ts      privacy-respecting event buffer → window.__m3analytics (PRD §27)
  ui.ts             cross-tree ref registry + scroll bus
components/         CinematicExperience (mode detection/switch), SceneContent, LoadingScreen,
                    Navigation, ChapterIndicator, CustomCursor, post-cinematic sections
scripts/
  pipeline.mjs      ffmpeg: frame sequence + manifest + chapter clips + stills + OG image
  smoke.mjs         headless QA (Playwright/Edge): scrub, reverse, CTA, analytics, mobile snap
public/
  frames/{d,m}/     447-frame WebP sequence + manifest.json
  video/            scene-0N.mp4 clips + master.mp4 (Path B)
  still/, og/       posters, design-section stills, share image (drift frame)
```

## Verification

`node scripts/smoke.mjs` against the served build — current result: **PASS**

- SSR HTML contains all scene copy (SEO per PRD §26)
- Canvas advances between chapters; reverse scrub restores scene text
- Scene 05 CTA becomes interactive in the final stretch
- Analytics: mode, loader gate, scene entries, reverse_scroll, experience_complete
- Mobile viewport: 5 snap sections, clip autoplay via IntersectionObserver
- Console errors: 0
