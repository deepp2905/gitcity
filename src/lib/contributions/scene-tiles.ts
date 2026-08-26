import type { ContributionDay, ContributionPeriod } from "./types";
import {
  completedCalendarYearRange,
  enumerateDays,
  toIsoDate,
  weekIndexOf,
  weekdayOf,
} from "./periods";

/**
 * One cell of the 3D grid. `day` is null for days the period's calendar
 * year contains but that haven't happened yet — the remainder of the
 * current year.
 */
export type SceneTile = {
  day: ContributionDay | null;
  /** Always present, including for padded days, so month labels can span
   * the whole calendar year rather than stopping at today. */
  date: string;
  weekIndex: number;
  weekday: number;
};

/** Year period ids look like `year-2026`. */
function yearOf(period: ContributionPeriod): number | null {
  const match = /^year-(\d{4})$/.exec(period.id);
  return match ? Number(match[1]) : null;
}

/**
 * Tiles for the 3D scene.
 *
 * A year still in progress otherwise renders ~18 columns shorter than a
 * completed one, so the city visibly shrinks when you switch to it and
 * the camera framing jumps. Padding the rest of the calendar year with
 * empty tiles keeps every year's footprint identical.
 *
 * The padding is visual scaffolding only: future tiles carry no data, so
 * they're excluded from the accessible grid rather than being announced
 * as "0 contributions" on days that haven't happened.
 */
export function buildSceneTiles(period: ContributionPeriod): SceneTile[] {
  const year = yearOf(period);

  // The rolling period is always a full window — nothing to pad.
  if (year === null) {
    return period.days.map((day) => ({
      day,
      date: day.date,
      weekIndex: day.weekIndex,
      weekday: day.weekday,
    }));
  }

  const { from, to } = completedCalendarYearRange(year);
  const daysByDate = new Map(period.days.map((day) => [day.date, day]));

  return enumerateDays(from, to).map((date) => {
    const iso = toIsoDate(date);
    const day = daysByDate.get(iso) ?? null;
    return {
      day,
      date: iso,
      // Recompute placement from the calendar year's own grid so real and
      // padded tiles share one coordinate system.
      weekIndex: weekIndexOf(date, from),
      weekday: weekdayOf(date),
    };
  });
}

/** Week columns the tile grid spans. */
export function sceneWeekCount(tiles: readonly SceneTile[]): number {
  return tiles.reduce((max, tile) => Math.max(max, tile.weekIndex + 1), 0);
}
