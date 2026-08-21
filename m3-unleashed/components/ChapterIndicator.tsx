"use client";

import { useEffect, useRef } from "react";
import { Scene } from "@/lib/scenes";
import { uiRefs } from "@/lib/ui";

interface ChapterIndicatorProps {
  scenes: Scene[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export default function ChapterIndicator({ scenes, activeIndex, onSelect }: ChapterIndicatorProps) {
  const rootRef = useRef<HTMLElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    uiRefs.indicatorRoot = rootRef.current;
    uiRefs.indicatorFill = fillRef.current;
    return () => {
      uiRefs.indicatorRoot = null;
      uiRefs.indicatorFill = null;
    };
  }, []);

  return (
    <nav className={`chapter-indicator${activeIndex === 2 ? " peak" : ""}`} ref={rootRef} aria-label="Chapters">
      <div className="chapter-track" aria-hidden="true">
        <div className="chapter-fill" ref={fillRef} />
      </div>
      <ol>
        {scenes.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`chapter-item${i === activeIndex ? " active" : ""}`}
              aria-current={i === activeIndex ? "true" : undefined}
              aria-label={`Chapter ${s.order}: ${s.title}`}
              data-cursor-hover
              onClick={() => onSelect(i)}
            >
              <span className="chapter-num">{String(s.order).padStart(2, "0")}</span>
              <span className="chapter-title">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
