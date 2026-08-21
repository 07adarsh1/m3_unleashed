/**
 * Frame-sequence store + canvas rendering — PRD Section 19.2 Path A.
 *
 * Memory strategy: compressed Blobs for the full sequence stay in memory
 * (~27MB); decoded frames live in a small LRU cache with directional
 * prefetch around the current playhead. Decoding 447 full-size bitmaps at
 * once would cost ~3.5GB of bitmap memory and cause scrub jank — this store
 * bounds that to `cap` frames (~300MB at 1920w) regardless of sequence length.
 */

export interface ManifestFrame {
  t: number;
  d: string;
  m: string;
}

export interface Manifest {
  duration: number;
  frames: ManifestFrame[];
}

export interface LoadProgress {
  ready: number;
  total: number;
  pct: number;
  bytes: number;
}

type DecodedImage = ImageBitmap | HTMLImageElement;

async function decodeBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap !== "undefined") {
    return createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

const NET_CONCURRENCY = 4;
const PREFETCH_AHEAD = 14;
const PREFETCH_BEHIND = 6;

export class FrameStore {
  private frames: { t: number; url: string }[] = [];
  private blobs = new Map<number, Blob>();
  private blobPromises = new Map<number, Promise<Blob | undefined>>();
  private bitmaps = new Map<number, DecodedImage>();
  private recent: number[] = []; // LRU order, oldest first
  private waiters = new Map<number, Set<() => void>>();
  private queue: number[] = [];
  private queued = new Set<number>();
  private urgent: number | null = null;
  private pumping = false;
  private fetchedCount = 0;
  private decodedCount = 0;
  private bytes = 0;
  private total = 0;
  private aborted = false;
  private ac = new AbortController();
  private gateResolve: (() => void) | null = null;
  private loadStarted = false;
  private lastProgressAt = Date.now();
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private cap: number;

  onProgress?: (p: LoadProgress) => void;
  onStall?: () => void;
  stalled = false;

  constructor(private manifestUrl: string, private set: "d" | "m", private gate = 24, cap?: number) {
    this.cap = cap ?? (set === "d" ? 40 : 64);
  }

  get fetched(): number {
    return this.fetchedCount;
  }
  get decoded(): number {
    return this.decodedCount;
  }
  get totalCount(): number {
    return this.total;
  }

  async load(): Promise<void> {
    if (this.loadStarted) return;
    this.loadStarted = true;

    this.stallTimer = setInterval(() => {
      if (this.stalled || this.aborted || this.total === 0 || this.fetchedCount >= this.total) return;
      if (Date.now() - this.lastProgressAt > 15000) {
        this.stalled = true;
        this.onStall?.();
      }
    }, 1000);

    try {
      const res = await fetch(this.manifestUrl, { signal: this.ac.signal });
      const manifest = (await res.json()) as Manifest;
      this.frames = manifest.frames.map((f) => ({
        t: f.t,
        url: `/frames/${this.set === "d" ? f.d : f.m}`,
      }));
      this.total = this.frames.length;
      this.emitProgress();

      // Fetch all compressed blobs front-to-back (cheap); decode stays bounded.
      let next = 0;
      const worker = async () => {
        while (next < this.total && !this.aborted) {
          const i = next++;
          await this.fetchBlob(i);
          if (i < this.gate) this.enqueue(i, true); // decode the opening burst first
        }
      };
      await Promise.all(Array.from({ length: NET_CONCURRENCY }, worker));
      this.resolveGateIfSatisfied();
    } finally {
      if (this.fetchedCount >= this.total && this.stallTimer) {
        clearInterval(this.stallTimer);
        this.stallTimer = null;
      }
    }
  }

  private emitProgress(): void {
    this.onProgress?.({
      ready: this.fetchedCount,
      total: this.total,
      pct: this.total ? this.fetchedCount / this.total : 0,
      bytes: this.bytes,
    });
  }

  private fetchBlob(i: number): Promise<Blob | undefined> {
    const cached = this.blobs.get(i);
    if (cached) return Promise.resolve(cached);
    let p = this.blobPromises.get(i);
    if (!p) {
      p = fetch(this.frames[i].url, { signal: this.ac.signal })
        .then((r) => r.blob())
        .then((b) => {
          this.blobs.set(i, b);
          this.bytes += b.size;
          this.fetchedCount++;
          this.lastProgressAt = Date.now();
          this.emitProgress();
          this.resolveGateIfSatisfied();
          return b;
        })
        .catch(() => undefined)
        .finally(() => this.blobPromises.delete(i));
      this.blobPromises.set(i, p);
    }
    return p;
  }

  /** Index of the frame nearest to time t (binary search). */
  nearestIndex(t: number): number {
    const n = this.frames.length;
    if (n === 0) return -1;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.frames[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return Math.abs(this.frames[lo].t - t) <= Math.abs(this.frames[hi].t - t) ? lo : hi;
  }

  /** Synchronous cache read for the render loop. */
  peek(i: number): DecodedImage | undefined {
    const b = this.bitmaps.get(i);
    if (b) this.touch(i);
    return b;
  }

  /** Decode-on-demand: resolves when frame i is drawable (or unavailable). */
  async ensure(i: number): Promise<DecodedImage | undefined> {
    if (this.aborted) return undefined;
    if (i < 0 || i >= this.total) return undefined;
    const cached = this.bitmaps.get(i);
    if (cached) {
      this.touch(i);
      return cached;
    }
    this.urgent = i;
    this.pump();
    return new Promise<DecodedImage | undefined>((resolve) => {
      const set = this.waiters.get(i) ?? new Set();
      set.add(() => resolve(this.bitmaps.get(i)));
      this.waiters.set(i, set);
    });
  }

  /** Queue decodes around the playhead, biased toward scroll direction. */
  prefetch(center: number, dir: number): void {
    if (this.aborted) return;
    const fwd = dir < 0 ? PREFETCH_BEHIND : PREFETCH_AHEAD;
    const back = dir < 0 ? PREFETCH_AHEAD : PREFETCH_BEHIND;
    for (let k = 1; k <= fwd; k++) this.enqueue(center + k);
    for (let k = 1; k <= back; k++) this.enqueue(center - k);
    this.pump();
  }

  private enqueue(i: number, front = false): void {
    if (i < 0 || i >= this.total || this.aborted) return;
    if (this.bitmaps.has(i) || this.queued.has(i)) return;
    this.queued.add(i);
    if (front) this.queue.unshift(i);
    else this.queue.push(i);
    if (this.queue.length > 48) {
      const dropped = this.queue.shift();
      if (dropped !== undefined) this.queued.delete(dropped);
    }
    this.pump();
  }

  private touch(i: number): void {
    const at = this.recent.indexOf(i);
    if (at >= 0) this.recent.splice(at, 1);
    this.recent.push(i);
  }

  private setBitmap(i: number, img: DecodedImage): void {
    this.bitmaps.set(i, img);
    this.touch(i);
    while (this.bitmaps.size > this.cap) {
      const old = this.recent.shift();
      if (old === undefined || old === i) break;
      const b = this.bitmaps.get(old);
      if (b instanceof ImageBitmap) b.close();
      this.bitmaps.delete(old);
    }
  }

  private pump(): void {
    if (this.pumping || this.aborted) return;
    this.pumping = true;
    this.pumpLoop().finally(() => {
      this.pumping = false;
    });
  }

  private async pumpLoop(): Promise<void> {
    // Serialized decoding: urgent (on-screen) first, then prefetch queue.
    while (!this.aborted) {
      let i = this.urgent;
      this.urgent = null;
      if (i === null) {
        while (this.queue.length > 0) {
          const j = this.queue.shift() as number;
          this.queued.delete(j);
          if (!this.bitmaps.has(j)) {
            i = j;
            break;
          }
        }
      }
      if (i === null || i === undefined) return;
      const blob = await this.fetchBlob(i);
      if (this.aborted) return;
      if (blob) {
        try {
          const img = await decodeBlob(blob);
          if (this.aborted) return;
          this.setBitmap(i, img);
          this.decodedCount++;
          this.resolveGateIfSatisfied();
        } catch {
          // unavailable frame — renderer holds the last good frame
        }
      }
      this.notify(i);
    }
  }

  private notify(i: number): void {
    const set = this.waiters.get(i);
    if (set) {
      this.waiters.delete(i);
      set.forEach((fn) => fn());
    }
  }

  private resolveGateIfSatisfied(): void {
    if (this.decodedCount >= Math.min(this.gate, Math.max(this.total, 1))) {
      this.gateResolve?.();
    }
  }

  waitGate(): Promise<void> {
    return new Promise((resolve) => {
      if (this.decodedCount >= Math.min(this.gate, Math.max(this.total, 1)) || this.aborted) {
        resolve();
      } else {
        this.gateResolve = resolve;
      }
    });
  }

  /** Resolve the "continue without video" path (PRD Section 24). */
  skipGate(): void {
    this.gateResolve?.();
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.ac.abort();
    if (this.stallTimer) clearInterval(this.stallTimer);
    this.bitmaps.forEach((b) => {
      if (b instanceof ImageBitmap) b.close();
    });
    this.bitmaps.clear();
    this.queue.length = 0;
    this.queued.clear();
    this.gateResolve?.();
    Array.from(this.waiters.keys()).forEach((i) => this.notify(i));
  }
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.resize();
  }

  resize(): void {
    if (!this.canvas) return;
    // DPR capped at 1.5 — cover-fit blits are fill-rate bound at high DPR
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Cover-fit blit of a 16:9 frame into the viewport-sized canvas. */
  draw(img: DecodedImage): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;
    const cw = canvas.width;
    const ch = canvas.height;
    if (!cw || !ch) return;
    const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
    const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
    if (!iw || !ih) return;
    const s = Math.max(cw / iw, ch / ih);
    const dw = iw * s;
    const dh = ih * s;
    // Cover-fit fully covers the canvas — no clear/fill pass needed per frame
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
}
