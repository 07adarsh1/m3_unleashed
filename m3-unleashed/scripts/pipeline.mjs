#!/usr/bin/env node
/**
 * Asset pipeline — PRD Phase 1 (Section 30).
 *
 * From assets/master.mp4 (H.264, 1920x1080, 24fps, 33.375s video stream) produces:
 *  - public/frames/{d,m}/f_XXXX.webp : scrub sequence, 12fps base with 18fps across the
 *      Scene 03 drift window (16.5–24s) where motion is fastest (PRD 19.2)
 *  - public/frames/manifest.json     : per-frame timecodes (renderer picks nearest-by-time)
 *  - public/video/scene-0N.mp4       : mobile chapter-snap clips (960w, faststart, audio-less)
 *  - public/video/master.mp4         : original master for Path B / non-interactive contexts
 *  - public/still/*.jpg              : hero poster, per-scene mobile posters, design stills
 *  - public/og/og-image.jpg          : share image from the drift sequence
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "assets", "master.mp4");
const DURATION = 33.375;

const SEGMENTS = [
  { t0: 0, t1: 16.5, fps: 12 },
  { t0: 16.5, t1: 24, fps: 18 }, // denser sampling across the kinetic peak
  { t0: 24, t1: 33.375, fps: 12 },
];
const SETS = [
  { dir: "d", width: 1920 },
  { dir: "m", width: 960 },
];
const SCENES = [
  [0, 9.5],
  [9.5, 16.5],
  [16.5, 24],
  [24, 30.5],
  [30.5, 33.375],
];

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) throw new Error(`ffmpeg failed (exit ${r.status}): ffmpeg ${args.join(" ")}`);
}

function probe() {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", SRC], { encoding: "utf8" });
  const err = r.stderr || "";
  const dur = err.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const fps = err.match(/([\d.]+) fps/);
  if (!dur || !fps) throw new Error("Could not probe source video");
  const seconds = (+dur[1] * 3600) + (+dur[2] * 60) + (+dur[3]);
  console.log(`[probe] container duration ${seconds.toFixed(3)}s @ ${fps[1]} fps`);
  if (Math.abs(seconds - 33.478) > 0.2) throw new Error(`Unexpected container duration ${seconds}`);
  if (Math.abs(+fps[1] - 24) > 0.1) throw new Error(`Unexpected frame rate ${fps[1]}`);
}

function extractFrames() {
  const tmp = join(ROOT, "tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const counts = {};
  let dTimes = null;

  for (const set of SETS) {
    const outDir = join(ROOT, "public", "frames", set.dir);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    let idx = 0;
    const times = [];
    for (let si = 0; si < SEGMENTS.length; si++) {
      const { t0, t1, fps } = SEGMENTS[si];
      const prefix = `seg_${set.dir}_${si}_`;
      const pattern = join(tmp, `${prefix}%04d.webp`);
      ffmpeg([
        "-ss", String(t0), "-i", SRC, "-t", String(t1 - t0),
        "-vf", `fps=${fps},scale=${set.width}:-2`,
        "-c:v", "libwebp", "-quality", "75",
        pattern,
      ]);
      const files = readdirSync(tmp).filter((f) => f.startsWith(prefix)).sort();
      for (let k = 0; k < files.length; k++) {
        const t = t0 + k / fps;
        if (t > DURATION - 0.002) continue;
        renameSync(join(tmp, files[k]), join(outDir, `f_${String(idx).padStart(4, "0")}.webp`));
        times.push(t);
        idx++;
      }
      for (const f of readdirSync(tmp)) if (f.startsWith(prefix)) rmSync(join(tmp, f));
      console.log(`[frames/${set.dir}] segment ${si} (${t0}s–${t1}s @${fps}fps): ${files.length} raw`);
    }

    // Exact final frame so progress=1 lands on the film's true last frame
    ffmpeg([
      "-ss", String(DURATION - 0.055), "-i", SRC, "-frames:v", "1",
      "-vf", `scale=${set.width}:-2`, "-c:v", "libwebp", "-quality", "75",
      join(outDir, `f_${String(idx).padStart(4, "0")}.webp`),
    ]);
    times.push(DURATION);
    counts[set.dir] = times.length;
    if (set.dir === "d") dTimes = times;
    console.log(`[frames/${set.dir}] total ${times.length} frames @ ${set.width}w`);
  }

  if (counts.d !== counts.m) throw new Error(`Frame count mismatch between sets: ${counts.d} vs ${counts.m}`);

  const manifest = {
    duration: DURATION,
    sampling: "12fps base / 18fps across 16.5-24s",
    frames: dTimes.map((t, i) => {
      const name = `f_${String(i).padStart(4, "0")}.webp`;
      return { t: Number(t.toFixed(4)), d: `d/${name}`, m: `m/${name}` };
    }),
  };
  writeFileSync(join(ROOT, "public", "frames", "manifest.json"), JSON.stringify(manifest));
  console.log(`[manifest] ${manifest.frames.length} frames written`);
  rmSync(tmp, { recursive: true, force: true });
}

function extractClips() {
  const dir = join(ROOT, "public", "video");
  mkdirSync(dir, { recursive: true });
  SCENES.forEach(([a, b], i) => {
    ffmpeg([
      "-ss", String(a), "-i", SRC, "-t", String(b - a),
      "-vf", "scale=960:-2",
      "-c:v", "libx264", "-crf", "23", "-preset", "medium", "-g", "48",
      "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
      join(dir, `scene-0${i + 1}.mp4`),
    ]);
    console.log(`[clip] scene-0${i + 1}.mp4 (${a}s–${b}s)`);
  });
  copyFileSync(SRC, join(dir, "master.mp4"));
  console.log("[clip] master.mp4 copied (Path B)");
}

function still(t, w, out, qv = 3) {
  ffmpeg(["-ss", String(t), "-i", SRC, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-q:v", String(qv), join(ROOT, "public", out)]);
}

function extractStills() {
  mkdirSync(join(ROOT, "public", "still"), { recursive: true });
  mkdirSync(join(ROOT, "public", "og"), { recursive: true });
  still(0, 1920, "still/hero-poster.jpg");
  SCENES.forEach((s, i) => still(s[0] + 0.02, 960, `still/scene-0${i + 1}-poster.jpg`));
  still(20.4, 1920, "og/og-image.jpg", 2); // drift sequence — PRD Section 26
  still(4.2, 1920, "still/design-1.jpg", 2);
  still(15.0, 1920, "still/design-2.jpg", 2);
  still(31.0, 1920, "still/design-3.jpg", 2);
  console.log("[stills] posters + design stills + og image written");
}

probe();
extractFrames();
extractClips();
extractStills();
console.log("[done] asset pipeline complete");
