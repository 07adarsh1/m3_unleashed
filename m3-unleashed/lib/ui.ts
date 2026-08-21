/**
 * Cross-tree wiring shared by controllers and chrome components.
 * Keeps the single-source-of-truth rule intact: controllers write chrome
 * state directly through these refs every frame — never via React state.
 */

export type ScrollHandler = (target: string | number, opts?: { immediate?: boolean; duration?: number }) => void;

export const scrollBus = {
  handler: null as ScrollHandler | null,
  set(handler: ScrollHandler) {
    this.handler = handler;
  },
  clear() {
    this.handler = null;
  },
  scrollTo(target: string | number, opts?: { immediate?: boolean; duration?: number }) {
    if (this.handler) {
      this.handler(target, opts);
    } else if (typeof target === "string") {
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo({ top: target, behavior: "smooth" });
    }
  },
};

export const uiRefs: {
  navLinks: HTMLElement | null;
  indicatorRoot: HTMLElement | null;
  indicatorFill: HTMLElement | null;
  mobileProgress: HTMLElement | null;
  mobileLabel: HTMLElement | null;
} = {
  navLinks: null,
  indicatorRoot: null,
  indicatorFill: null,
  mobileProgress: null,
  mobileLabel: null,
};
