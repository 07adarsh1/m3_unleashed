#!/usr/bin/env node
/**
 * Headless smoke test — drives the built site (serve out) with system Edge.
 * Verifies: loader gate, scroll-scrub frame progression, scene choreography,
 * reverse scrub, analytics events, and the mobile chapter-snap mode.
 * Screenshots are written to qa-shots/ for visual review.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const URL = process.env.URL || "http://localhost:4173";
const OUT = join(process.cwd(), "qa-shots");
mkdirSync(OUT, { recursive: true });

const results = { consoleErrors: [], pageErrors: [] };
const log = (m) => console.log(`[smoke] ${m}`);

async function scrollBy(page, dy) {
  await page.mouse.wheel(0, dy);
}

async function waitForLoader(page, timeout = 45000) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".loading-screen");
      if (!el) return true;
      const cs = getComputedStyle(el);
      return cs.display === "none" || Number(cs.opacity) === 0;
    },
    { timeout }
  );
}

async function canvasSig(page) {
  return page.evaluate(() => {
    const c = document.querySelector(".video-canvas");
    if (!c) return null;
    try {
      const ctx = c.getContext("2d");
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      const step = 401 * 4;
      for (let i = 0; i < data.length; i += step) sum += data[i] + data[i + 1] + data[i + 2];
      return sum;
    } catch {
      return -1;
    }
  });
}

async function run() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  // ---------- Desktop scrub ----------
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("console", (m) => {
    if (m.type() === "error") results.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => results.pageErrors.push(String(e)));

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  const title = await page.title();
  log(`title: ${title}`);

  // SSR content check (PRD 26: scene copy in initial HTML)
  const html = await page.content();
  for (const needle of ["COMPETITION", "M POWER", "INLINE SIX", "BUILT FOR", "Skip cinematic intro"]) {
    if (!html.includes(needle)) throw new Error(`SSR HTML missing: ${needle}`);
  }
  log("SSR scene copy present");

  await waitForLoader(page);
  log("loader dismissed");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "01-hero.jpg"), type: "jpeg", quality: 80 });

  // Scroll into scene 2 (~35% of pin distance)
  const pin = await page.evaluate(() => window.innerHeight * 6);
  log(`pin distance: ${pin}px`);

  await page.evaluate((y) => window.scrollTo(0, y), Math.round(pin * 0.33));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, "02-scene2-stats.jpg"), type: "jpeg", quality: 80 });
  const sig2 = await canvasSig(page);

  // Scene 3 drift (~57%)
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(pin * 0.57));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(OUT, "03-scene3-drift.jpg"), type: "jpeg", quality: 80 });
  const sig3 = await canvasSig(page);
  if (sig2 === null || sig3 === null || sig2 === sig3) throw new Error(`Canvas did not advance between scenes (${sig2} vs ${sig3})`);
  log(`canvas signature advanced (${sig2} -> ${sig3})`);

  // Scene 5 finale (~97%) — CTA should be visible
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(pin * 0.99));
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(OUT, "04-scene5-cta.jpg"), type: "jpeg", quality: 80 });
  const ctaVisible = await page.evaluate(() => {
    const cta = document.querySelector("[data-scene-index='4'] [data-el='cta']");
    if (!cta) return false;
    const cs = getComputedStyle(cta);
    return cs.pointerEvents === "auto" && Number(cs.opacity) > 0.5;
  });
  log(`scene 5 CTA interactive: ${ctaVisible}`);

  // Reverse scrub: back to scene 2 — text must re-enter (PRD 12.2)
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(pin * 0.33));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "05-reverse-scene2.jpg"), type: "jpeg", quality: 80 });
  const reverseOk = await page.evaluate(() => {
    const p = document.querySelector("[data-scene-index='1'] [data-el='primary']");
    return p ? Number(getComputedStyle(p).opacity) > 0.5 : false;
  });
  log(`reverse scrub restored scene 2 text: ${reverseOk}`);

  // Scroll to the very end — final frame + chapter indicator filled
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(pin * 1.02));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "06-post-cta.jpg"), type: "jpeg", quality: 80 });

  const analytics = await page.evaluate(() => (window.__m3analytics || []).map((e) => e.name));
  log(`analytics events: ${analytics.join(", ")}`);

  const titleOk = /BMW M3 Competition/.test(title);
  const ctaOk = ctaVisible === true;
  const reverseScrubbOk = reverseOk === true;
  const eventsOk = analytics.includes("scene_enter") && analytics.includes("reverse_scroll") && analytics.includes("experience_complete");

  await page.close();

  // ---------- Mobile chapter-snap ----------
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  mob.on("pageerror", (e) => results.pageErrors.push(String(e)));
  await mob.goto(URL, { waitUntil: "domcontentloaded" });
  await mob.waitForTimeout(1800);
  const snapCount = await mob.evaluate(() => document.querySelectorAll(".snap-section").length);
  log(`mobile snap sections: ${snapCount}`);
  await mob.screenshot({ path: join(OUT, "07-mobile-scene1.jpg"), type: "jpeg", quality: 80 });
  await mob.evaluate(() => document.querySelectorAll(".snap-section")[3].scrollIntoView());
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: join(OUT, "08-mobile-scene4.jpg"), type: "jpeg", quality: 80 });
  const mobPlaying = await mob.evaluate(() => {
    const v = document.querySelectorAll(".snap-section video")[3];
    return v ? !v.paused : false;
  });
  log(`mobile scene 4 clip playing: ${mobPlaying}`);
  await mob.close();

  await browser.close();

  console.log("\n[smoke] SUMMARY");
  console.log(`  title ok:            ${titleOk}`);
  console.log(`  canvas scrub ok:     true`);
  console.log(`  scene5 CTA ok:       ${ctaOk}`);
  console.log(`  reverse scrub ok:    ${reverseScrubbOk}`);
  console.log(`  analytics ok:        ${eventsOk}`);
  console.log(`  mobile snap count:   ${snapCount} (expect 5)`);
  console.log(`  mobile autoplay ok:  ${mobPlaying}`);
  console.log(`  console errors:      ${results.consoleErrors.length}`);
  results.consoleErrors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
  console.log(`  page errors:         ${results.pageErrors.length}`);
  results.pageErrors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));

  const pass = titleOk && ctaOk && reverseScrubbOk && eventsOk && snapCount === 5 && results.pageErrors.filter((e) => !/abort/i.test(e)).length === 0;
  console.log(`\n[smoke] ${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

run().catch((e) => {
  console.error("[smoke] FATAL", e);
  process.exit(1);
});
