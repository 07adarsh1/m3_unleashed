/**
 * Data-driven scene configuration — PRD Section 20.
 * All timecodes are absolute video-time seconds on the 33.375s master.
 * Scroll-distance weighting per PRD Section 11 weighting note (must sum to 1.0).
 */

export interface SceneStat {
  id: string;
  value: number;
  unit: string;
  decimals?: number;
  label: string;
  videoWindow: [number, number];
}

export interface PointerLine {
  videoWindow: [number, number];
  from: { x: number; y: number }; // % of overlay
  to: { x: number; y: number };
}

export interface Scene {
  id: string;
  order: number;
  title: string;
  videoRange: [number, number];
  scrollWeight: number;
  content: {
    primaryLines: string[];
    secondary?: string;
    cta?: string;
    ctaAriaLabel?: string;
  };
  textPosition: "center-lower" | "left-third" | "center-peak" | "right-anchor" | "full-bleed";
  stats?: SceneStat[];
  pointerLines?: PointerLine[];
  animation: {
    entry: "blur-sharp" | "letter-contract" | "impact-scale";
    exit: "fade-translate" | "fade-fast" | "none";
  };
  effects?: { velocityTrail?: boolean };
  theme?: "default" | "peak";
}

export const VIDEO_DURATION = 33.375;
export const PIN_VIEWPORTS = 6;

export const SCENES: Scene[] = [
  {
    id: "scene-01-arrival",
    order: 1,
    title: "THE ARRIVAL",
    videoRange: [0.0, 9.5],
    scrollWeight: 0.25,
    content: {
      primaryLines: ["M3", "COMPETITION"],
      secondary: "THE ULTIMATE DRIVING MACHINE",
    },
    textPosition: "center-lower",
    animation: { entry: "letter-contract", exit: "fade-translate" },
  },
  {
    id: "scene-02-details",
    order: 2,
    title: "THE DETAILS",
    videoRange: [9.5, 16.5],
    scrollWeight: 0.2,
    content: {
      primaryLines: ["M POWER"],
      secondary: "PRECISION IN EVERY ROTATION",
    },
    textPosition: "left-third",
    stats: [
      { id: "hp", value: 510, unit: "HP", label: "Output", videoWindow: [12.5, 14.0] },
      { id: "nm", value: 650, unit: "NM", label: "Torque", videoWindow: [14.0, 15.2] },
      { id: "accel", value: 3.5, unit: "S", decimals: 1, label: "0–100 km/h", videoWindow: [15.2, 16.5] },
    ],
    pointerLines: [
      { videoWindow: [9.8, 12.2], from: { x: 37, y: 46 }, to: { x: 55, y: 40 } },
      { videoWindow: [14.0, 16.3], from: { x: 37, y: 64 }, to: { x: 53, y: 71 } },
    ],
    animation: { entry: "blur-sharp", exit: "fade-fast" },
  },
  {
    id: "scene-03-machine",
    order: 3,
    title: "THE MACHINE",
    videoRange: [16.5, 24.0],
    scrollWeight: 0.22,
    content: {
      primaryLines: ["INLINE SIX"],
      secondary: "ENGINEERED WITHOUT COMPROMISE.",
    },
    textPosition: "center-peak",
    animation: { entry: "impact-scale", exit: "fade-translate" },
    effects: { velocityTrail: true },
    theme: "peak",
  },
  {
    id: "scene-04-road",
    order: 4,
    title: "THE ROAD",
    videoRange: [24.0, 30.5],
    scrollWeight: 0.18,
    content: {
      primaryLines: ["BUILT FOR", "THE ROAD."],
    },
    textPosition: "right-anchor",
    animation: { entry: "blur-sharp", exit: "fade-translate" },
  },
  {
    id: "scene-05-escape",
    order: 5,
    title: "THE ESCAPE",
    videoRange: [30.5, 33.375],
    scrollWeight: 0.15,
    content: {
      primaryLines: ["M3", "COMPETITION"],
      cta: "EXPLORE THE M3",
      ctaAriaLabel: "Explore the M3 Competition",
    },
    textPosition: "full-bleed",
    animation: { entry: "letter-contract", exit: "none" },
  },
];

const weightSum = SCENES.reduce((a, s) => a + s.scrollWeight, 0);
if (Math.abs(weightSum - 1) > 1e-6) {
  throw new Error(`Scene scrollWeights must sum to 1.0 (got ${weightSum})`);
}
