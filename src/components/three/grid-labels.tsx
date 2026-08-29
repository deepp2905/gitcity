"use client";

import type { SceneTile } from "@/lib/contributions/scene-tiles";
import { buildMonthLabels } from "@/lib/contributions/grid";
import { CELL_SIZE, tilePosition } from "@/lib/three/layout";
import { projectFlat } from "@/lib/three/camera";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VISIBLE_WEEKDAY_ROWS = new Set([1, 3, 5]);

/**
 * Gaps between a label and the grid, in px.
 *
 * Tighter on a phone to match the smaller type. The weekday gap is the
 * one that matters: the labels sit in a fixed 34px gutter, and at 12px
 * "Wed" plus the desktop offset filled it exactly, so anything wider
 * clipped.
 */
const MONTH_GAP_PX = { mobile: 13, desktop: 18 };
const WEEKDAY_GAP_PX = { mobile: 5, desktop: 8 };

type GridLabelsProps = {
  tiles: SceneTile[];
  weekCount: number;
  width: number;
  height: number;
  zoom: number;
  /** Tile gap in world units, so labels track a retuned grid. */
  cellGap: number;
  isMobile: boolean;
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
  tiles,
  weekCount,
  width,
  height,
  zoom,
  cellGap,
  isMobile,
  progress,
}: GridLabelsProps) {
  if (width === 0 || height === 0 || weekCount === 0) return null;

  // Chart furniture belongs to the flat grid alone. These are positioned
  // by the top-down projection, so the moment the camera tilts they are
  // describing a view that no longer exists -- and a city does not want
  // axis labels anyway. Shown only once the transform has fully arrived
  // back at flat, not merely started heading there.
  const settledFlat = progress <= 0.0001;

  const months = buildMonthLabels(tiles);
  const halfCell = (CELL_SIZE / 2) * zoom;
  const monthGap = isMobile ? MONTH_GAP_PX.mobile : MONTH_GAP_PX.desktop;
  const weekdayGap = isMobile ? WEEKDAY_GAP_PX.mobile : WEEKDAY_GAP_PX.desktop;

  return (
    <div
      aria-hidden="true"
      // Eased in a beat after landing flat, letting the city settle
      // before the chart furniture arrives. Removed instantly when
      // anything moves, though -- delay-0 as well as duration-0, or the
      // delay would apply on the way out too and labels would linger over
      // a tilting city.
      // 10px on a phone. The grid is width-constrained there, so a month
      // occupies about 24px of screen and 12px type runs the labels into
      // one another.
      className={`pointer-events-none absolute inset-0 text-[10px] leading-none text-ink-muted transition-opacity sm:text-xs ${
        settledFlat
          ? "opacity-100 delay-100 duration-300 ease-out"
          : "opacity-0 delay-0 duration-0"
      }`}
    >
      {months.map((month) => {
        const { x, z } = tilePosition(month.weekIndex, 0, weekCount, cellGap);
        const { left, top } = projectFlat(x, z, width, height, zoom);
        return (
          <span
            key={`${month.label}-${month.weekIndex}`}
            className="absolute -translate-x-1/2"
            style={{ left, top: top - halfCell - monthGap }}
          >
            {month.label}
          </span>
        );
      })}

      {WEEKDAY_SHORT.map((name, weekday) => {
        if (!VISIBLE_WEEKDAY_ROWS.has(weekday)) return null;
        const { x, z } = tilePosition(0, weekday, weekCount, cellGap);
        const { left, top } = projectFlat(x, z, width, height, zoom);
        return (
          <span
            key={name}
            // The vertical centring lives in the transform below, and
            // only there. Tailwind's -translate-y-1/2 sets the standalone
            // `translate` property in v4, which composes with `transform`
            // rather than being overridden by it -- so having both shifted
            // every label a full line-box up instead of half.
            className="absolute text-right"
            style={{
              left: left - halfCell - weekdayGap,
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
