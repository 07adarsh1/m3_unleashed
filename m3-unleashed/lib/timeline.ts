/**
 * Progress → scene → video-time resolution — PRD Sections 11 & 19.
 * Piecewise-linear mapping derived from scene scrollWeights and videoRanges.
 * This module is the single authority for the mapping; nothing else re-derives it.
 */

import { Scene, SCENES, VIDEO_DURATION } from "./scenes";

export interface Resolved {
  sceneIndex: number;
  scene: Scene;
  sceneProgress: number; // 0–1 within the active scene
  videoTime: number; // absolute seconds on the master
  globalProgress: number; // 0–1 across the whole pinned experience
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Cumulative global-progress start of each scene.
export const SCENE_STARTS: number[] = SCENES.reduce<number[]>((acc, s, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].scrollWeight);
  return acc;
}, []);

export function sceneScrollRange(index: number): [number, number] {
  const start = SCENE_STARTS[index];
  return [start, start + SCENES[index].scrollWeight];
}

export function resolveProgress(globalProgress: number): Resolved {
  const g = clamp(globalProgress, 0, 1);
  let sceneIndex = SCENES.length - 1;
  for (let i = 0; i < SCENES.length; i++) {
    if (g < SCENE_STARTS[i] + SCENES[i].scrollWeight || i === SCENES.length - 1) {
      sceneIndex = i;
      break;
    }
  }
  const scene = SCENES[sceneIndex];
  const [rs, re] = sceneScrollRange(sceneIndex);
  const sceneProgress = clamp((g - rs) / (re - rs), 0, 1);
  const [vs, ve] = scene.videoRange;
  const videoTime = clamp(vs + sceneProgress * (ve - vs), 0, VIDEO_DURATION);
  return { sceneIndex, scene, sceneProgress, videoTime, globalProgress: g };
}

export function videoTimeForScene(scene: Scene, sceneProgress: number): number {
  const [vs, ve] = scene.videoRange;
  return clamp(vs + clamp(sceneProgress, 0, 1) * (ve - vs), 0, VIDEO_DURATION);
}
