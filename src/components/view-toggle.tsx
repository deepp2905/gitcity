"use client";

import type { ViewMode } from "@/lib/state/url-state";

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
      className="min-h-11 rounded-full border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-4 text-sm font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-md transition-colors hover:bg-canvas-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {isCity ? "Flatten to 2D" : "Transform to 3D"}
    </button>
  );
}
