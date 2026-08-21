# M3 // UNLEASHED

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)
![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02?style=for-the-badge&logo=greensock)
![Lenis](https://img.shields.io/badge/Lenis-Smooth_Scroll-orange?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?style=for-the-badge&logo=vercel)

**A scroll-driven cinematic microsite built around the BMW M3 Competition short film.**  
*(Based on "BMW M3 Competition — 4K Cinematic Short Video" by Damir Who, 33.375s, 24fps, 1080p)*

</div>

---

## ⚡ The Core Mechanic: SCROLL = THROTTLE

Scroll position — not autoplay, not a timer — is the only thing that advances the film.
- **Scroll Down**: Accelerates forward through the film frame-by-frame.
- **Scroll Up**: Reverses playback frame-accurately with zero stutter.
- **Synchronized UI**: Typography, performance stats, HUD telemetry, and choreography are hard-bound to the exact frame timecodes.

---

## ✨ Features

- 🏎️ **Frame-Accurate Scrubbing**: Custom dual-resolution WebP sequence engine (`d/` 1920w desktop, `m/` 960w mobile) rendered via high-performance HTML5 `<canvas>`.
- 🧠 **Bounded Memory Management**: Compresses the 447-frame sequence in memory (~27MB) and decodes via a smart LRU cache (~40 frames) with directional prefetching.
- 📱 **Adaptive Dual-Mode Engine**:
  - **Desktop (>=768px)**: Continuous canvas WebP frame scrub with Lenis inertial smoothing.
  - **Mobile (<768px)**: 5 full-viewport scroll-snapped chapters with optimized looping video clips (`scene-0N.mp4`) and scrubbed typography.
- 🎯 **Single rAF Orchestration**: A unified `gsap.ticker` loop updates scroll progress, canvas frames, HUD pointers, count-up numbers, velocity trails, and chapter indicators without React state overhead in the hot path.
- ♿ **Full Accessibility & SEO**: Skip links, screen-reader linear transcripts, `prefers-reduced-motion` fallbacks, Google Fonts (`Barlow`, `Barlow Condensed`), and Schema.org `VideoObject` structured metadata.

---

## 🎬 The Five Cinematic Chapters

| # | Chapter | Video Range | Scroll Weight | Signature Experience |
|---|---|---|---|---|
| **01** | **THE ARRIVAL** | `0.0s – 9.5s` | 25% | Garage darkness, headlight illumination, contraction typography entry |
| **02** | **THE DETAILS** | `9.5s – 16.5s` | 20% | Precision badge/wheel pointer lines, live stat counters (*510 HP / 650 Nm / 3.5s*) |
| **03** | **THE MACHINE** | `16.5s – 24.0s` | 22% | Peak drift sequence: impact zoom, velocity-reactive chromatic trail, 2x pulse |
| **04** | **THE ROAD** | `24.0s – 30.5s` | 18% | The cinematic exhale — right-anchored layout, aerodynamic typography |
| **05** | **THE ESCAPE** | `30.5s – 33.375s` | 15% | Frost finale, final lockup, interactive configure CTA in the final stretch |

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/07adarsh1/m3_unleashed.git
cd m3_unleashed/m3-unleashed
npm install
```

### 2. Run Development Server

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application in your browser.

### 3. Production Build & Static Preview

```bash
npm run build
npm start
```
This runs a static export to `out/` and serves it locally at [http://localhost:4173](http://localhost:4173).

---

## ☁️ Vercel Deployment Guide

### Option 1: Vercel Dashboard (Git Import)
1. Import your repository into **[Vercel](https://vercel.com)**.
2. In the **Project Settings**:
   - Set **Root Directory** to `m3-unleashed`.
   - Framework Preset: **Next.js** *(automatically detected)*.
   - Build Command: `next build` *(default)*.
   - Output Directory: `out` *(default)*.
3. Click **Deploy**.

### Option 2: Vercel CLI
Deploy directly from your terminal inside the project directory:
```bash
cd m3-unleashed
npx vercel --prod
```

---

## 🛠️ Project Structure

```text
m3-unleashed/
├── app/
│   ├── globals.css           # Design system tokens, typography, dark theme
│   ├── layout.tsx            # Metadata, fonts (Barlow), OpenGraph, JSON-LD Schema
│   └── page.tsx              # Main page assembly + screen-reader transcripts
├── components/
│   ├── ChapterIndicator.tsx  # Interactive HUD progress rail & chapter dots
│   ├── CinematicExperience.tsx # Dual-mode controller switcher (Desktop vs Mobile)
│   ├── CustomCursor.tsx      # Smooth magnetic crosshair cursor
│   ├── LoadingScreen.tsx     # Byte-accurate asset loader & progressive gate
│   ├── Navigation.tsx        # Minimalist glassmorphic top navigation
│   ├── SceneContent.tsx      # Chapter title, subtitle, badges & pointer overlays
│   └── sections.tsx          # Post-experience sections (Performance, Design, CTA, Footer)
├── lib/
│   ├── analytics.ts          # Privacy-friendly client event telemetry
│   ├── desktopController.ts  # Pinning, Lenis smooth scroll, ticker rAF orchestration
│   ├── frames.ts             # FrameLoader (LRU cache, WebP blitter, binary search)
│   ├── sceneTimelines.ts     # Scrubbed GSAP timelines & animated count-up logic
│   ├── scenes.ts             # Typed single source of truth for all chapter copy & timings
│   ├── snapController.ts     # Mobile scroll-snap controller with video loop sync
│   └── timeline.ts           # Piecewise progress to scene resolution math
├── public/
│   ├── frames/               # Dual-resolution 447 WebP frame sequences (d/ and m/)
│   ├── video/                # Scene clips & fallback master video
│   ├── still/                # High-res poster stills & design gallery images
│   └── og/                   # OpenGraph social preview images
└── scripts/
    ├── pipeline.mjs          # FFmpeg automated frame extraction pipeline
    ├── smoke.mjs             # Playwright headless QA verification suite
    └── perf.mjs              # Performance & FPS measurement harness
```

---

## 🧪 QA & Verification

Run the automated headless test suite:
```bash
cd m3-unleashed
node scripts/smoke.mjs
```

**Verification Criteria:**
- [x] SSR HTML contains all scene copy (Zero-JS indexing & SEO compliance).
- [x] Forward & reverse scrubbing transitions all visual states cleanly.
- [x] Zero seek/decode latency during fast continuous scroll.
- [x] Mobile viewport automatically transitions to 5-section snapping with clip playback.
- [x] Zero runtime console errors.

---

## 📄 License

MIT License. Designed & Developed for interactive storytelling.
