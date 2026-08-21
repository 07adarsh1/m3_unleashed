/**
 * Privacy-respecting analytics stub — PRD Section 27.
 * Events are buffered in-memory and exposed as window.__m3analytics for
 * later wiring to a real endpoint. No PII, no network calls.
 */

export interface AnalyticsEvent {
  name: string;
  data?: Record<string, unknown>;
  t: number;
}

const events: AnalyticsEvent[] = [];

export function track(name: string, data?: Record<string, unknown>): void {
  const event: AnalyticsEvent = { name, data, t: Date.now() };
  events.push(event);
  if (typeof window !== "undefined") {
    (window as unknown as { __m3analytics?: AnalyticsEvent[] }).__m3analytics = events;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug(`[analytics] ${name}`, data ?? "");
    }
  }
}

export function getEvents(): AnalyticsEvent[] {
  return events;
}
