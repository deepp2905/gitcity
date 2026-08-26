"use client";

import type { ViewMode } from "@/lib/state/url-state";

/** [flat state label, city state label] */
const LABELS = ["Transform to 3D", "Flatten to 2D"] as const;

type ViewToggleProps = {
  view: ViewMode;
  onToggle: (next: ViewMode) => void;
};

/**
 * Sits alongside the period tabs and matches their pill treatment, so
 * the two controls read as one row rather than a button floating under
 * the scene.
 */
export function ViewToggle({ view, onToggle }: ViewToggleProps) {
  const isCity = view === "3d";

  return (
    <button
      type="button"
      onClick={() => onToggle(isCity ? "2d" : "3d")}
      className="relative grid min-h-11 place-items-center rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-4 text-sm font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-md transition-colors hover:bg-canvas-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/*
        Both labels are stacked in the same grid cell, so the button is
        always as wide as the longer one and never resizes when the state
        flips. The inactive label is hidden from assistive tech as well as
        from view.
      */}
      {LABELS.map((label) => {
        const active = label === (isCity ? LABELS[1] : LABELS[0]);
        return (
          <span
            key={label}
            aria-hidden={active ? undefined : true}
            className={`col-start-1 row-start-1 whitespace-nowrap ${
              active ? "" : "invisible"
            }`}
          >
            {label}
          </span>
        );
      })}
    </button>
  );
}
