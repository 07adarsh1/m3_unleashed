"use client";

import { MouseEvent } from "react";
import { Scene } from "@/lib/scenes";
import { scrollBus } from "@/lib/ui";
import { track } from "@/lib/analytics";

interface SceneContentProps {
  scene: Scene;
  index: number;
  variant: "desktop" | "snap";
}

export default function SceneContent({ scene, index, variant }: SceneContentProps) {
  const Heading = index === 0 ? "h1" : "h2";

  const onCtaClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    track("cta_click", { from: variant === "desktop" ? "scene-05" : "snap-scene-05" });
    if (variant === "desktop" && scrollBus.handler) {
      scrollBus.scrollTo("#performance");
    } else {
      document.documentElement.classList.remove("snap-mode");
      document.getElementById("performance")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className={`scene pos-${scene.textPosition} theme-${scene.theme ?? "default"}`} data-scene-index={index}>
      <div className="scene-inner">
        <div className="scene-primary-wrap">
          <Heading className="scene-primary" data-el="primary">
            {scene.content.primaryLines.map((line, i) => (
              <span className="scene-primary-line" key={i}>
                {line}
              </span>
            ))}
          </Heading>
        </div>
        {scene.content.secondary ? (
          <p className="scene-secondary" data-el="secondary">
            {scene.content.secondary}
          </p>
        ) : null}
        {scene.stats ? (
          <div className="scene-stats">
            {scene.stats.map((stat) => (
              <div className="scene-stat" data-el="stat" data-stat={stat.id} key={stat.id}>
                <span className="scene-stat-numeral">
                  <span className="scene-stat-value" data-el="stat-value">
                    {stat.value.toFixed(stat.decimals ?? 0)}
                  </span>
                  <span className="scene-stat-unit">{stat.unit}</span>
                </span>
                <span className="scene-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {variant === "desktop" && scene.pointerLines ? (
          <svg className="scene-pointers" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {scene.pointerLines.map((pl, i) => (
              <line
                key={i}
                data-el="pointer-line"
                data-window={JSON.stringify(pl.videoWindow)}
                x1={pl.from.x}
                y1={pl.from.y}
                x2={pl.to.x}
                y2={pl.to.y}
                pathLength={1}
              />
            ))}
          </svg>
        ) : null}
        {scene.content.cta ? (
          <a
            href="#performance"
            className="scene-cta"
            data-el="cta"
            aria-label={scene.content.ctaAriaLabel}
            data-cursor-label="VIEW →"
            data-cursor-hover
            onClick={onCtaClick}
          >
            {scene.content.cta}
          </a>
        ) : null}
      </div>
      {variant === "snap" && index === 0 ? (
        <div className="swipe-prompt" data-el="swipe-prompt" aria-hidden="true">
          SWIPE TO EXPERIENCE
        </div>
      ) : null}
    </div>
  );
}
