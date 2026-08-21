#!/usr/bin/env node
/**
 * Performance probe — scrolls through the whole film at a realistic pace and
 * samples FPS during active scrub plus heap/resource usage at the end.
 */
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:4173";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(URL, { waitUntil: "domcontentloaded" });

await page.waitForFunction(
  () => {
    const el = document.querySelector(".loading-screen");
    return !el || getComputedStyle(el).display === "none" || Number(getComputedStyle(el).opacity) === 0;
  },
  { timeout: 60000 }
);
console.log("[perf] loader dismissed, scrubbing…");

// FPS counter armed for the scroll phase only
await page.evaluate(() => {
  window.__frames = 0;
  window.__t0 = performance.now();
  const loop = () => {
    window.__frames++;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

const pin = await page.evaluate(() => window.innerHeight * 6);
const steps = 48;
const heapSamples = [];
for (let s = 1; s <= steps; s++) {
  await page.evaluate((y) => window.scrollTo(0, y), Math.round((pin * 1.02 * s) / steps));
  await page.waitForTimeout(220);
  if (s % 12 === 0) {
    heapSamples.push(
      await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null))
    );
  }
}

const stats = await page.evaluate(() => {
  const secs = (performance.now() - window.__t0) / 1000;
  const res = performance.getEntriesByType("resource").filter((r) => r.name.includes("/frames/"));
  return {
    fps: +(window.__frames / secs).toFixed(1),
    scrollSeconds: +secs.toFixed(1),
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    frameRequests: res.length,
  };
});
console.log(`[perf] FPS during scrub: ${stats.fps}`);
console.log(`[perf] scroll phase: ${stats.scrollSeconds}s, frame requests: ${stats.frameRequests}/447`);
console.log(`[perf] heap at 25/50/75/100%: ${heapSamples.join(" / ")} MB (final ${stats.heapMB} MB)`);

await browser.close();
