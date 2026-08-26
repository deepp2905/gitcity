"use client";

import type { ContributionDay } from "@/lib/contributions/types";
import { buildMonthLabels } from "@/lib/contributions/grid";
import { CELL_SIZE, PITCH, tilePosition } from "@/lib/three/layout";
import { projectFlat } from "@/lib/three/camera";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_WEEKDAY_ROWS = new Set([1, 3, 5]);

type GridLabelsProps = {
  days: ContributionDay[];
  weekCount: number;
  width: number;
  height: number;
  zoom: number;
  /** 0 = flat (labels fully visible), 1 = city (fully faded). */
  progress: number;
};

/**
 * Month and weekday labels as a crisp DOM overlay on the canvas.
 *
 * At the flat view the orthographic projection is a plain linear map, so
 * labels can be placed exactly over their columns and rows. They fade out
 * as soon as the tilt begins — past that point the projection no longer
 * matches, and the city doesn't want chart furniture anyway.
 */
export function GridLabels({
  days,
  weekCount,
  width,
  height,
  zoom,
  progress,
}: GridLabelsProps) {
  if (width === 0 || height === 0 || weekCount === 0) return null;

  // Fade across the first fifth of the transform (~160ms of an 800ms
  // tilt), so the flat grid is gone before the angle is legible.
  const opacity = Math.max(0, 1 - progress * 5);
  if (opacity === 0) return null;

  const months = buildMonthLabels(days);
  const halfCell = (CELL_SIZE / 2) * zoom;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 text-xs text-ink-muted"
      style={{ opacity }}
    >
      {months.map((month) => {
        const { x, z } = tilePosition(month.weekIndex, 0, weekCount);
        const { left, top } = projectFlat(x, z, width, height, zoom);
        return (
          <span
            key={`${month.label}-${month.weekIndex}`}
            className="absolute -translate-x-1/2"
            style={{ left, top: top - halfCell - 18 }}
          >
            {month.label}
          </span>
        );
      })}

      {WEEKDAY_SHORT.map((name, weekday) => {
        if (!VISIBLE_WEEKDAY_ROWS.has(weekday)) return null;
        const { x, z } = tilePosition(0, weekday, weekCount);
        const { left, top } = projectFlat(x, z, width, height, zoom);
        return (
          <span
            key={name}
            className="absolute -translate-y-1/2 text-right"
            style={{
              left: left - halfCell - 8,
              top,
              transform: "translate(-100%, -50%)",
            }}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

/** Exported for the scene to size its padding consistently. */
export const LABEL_GUTTER_PX = PITCH;
