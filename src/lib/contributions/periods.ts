import type { PeriodId } from "./types";

/**
 * Date/week math for contribution periods. Everything here operates in UTC
 * so results are deterministic regardless of the server's local timezone —
 * GitHub's contribution calendar is date-only (YYYY-MM-DD), so we treat
 * every boundary as a UTC calendar date rather than an instant in some
 * local timezone.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MAX_CALENDAR_YEARS = 4;

export type PeriodBoundary = {
  id: PeriodId;
  label: string;
  from: Date;
  to: Date;
};

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

/** GitHub's default "last 12 months" window: the same month/day one year
 * ago through now (handles leap years correctly — Date.UTC normalizes
 * Feb 29 -> Mar 1 in non-leap target years, matching GitHub's own
 * behavior for a from/to pair one calendar year apart). */
export function rollingLast12MonthsFrom(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear() - 1,
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

export function completedCalendarYearRange(year: number): {
  from: Date;
  to: Date;
} {
  return { from: utcDate(year, 0, 1), to: endOfUtcDay(utcDate(year, 11, 31)) };
}

export function currentCalendarYearRange(now: Date): { from: Date; to: Date } {
  return { from: utcDate(now.getUTCFullYear(), 0, 1), to: now };
}

/**
 * The four calendar years we always query GitHub for, before we know
 * which years the account actually has contribution history in: the
 * current year and the three preceding it. `buildPeriodBoundaries` (used
 * once we know `contributionYears`) picks the tabs to actually show from
 * among these — see src/lib/github/query.ts for why the query has to
 * commit to a fixed candidate set up front (GraphQL aliases are static).
 */
export function staticCandidateYears(now: Date): number[] {
  const year = now.getUTCFullYear();
  return [year, year - 1, year - 2, year - 3];
}

/**
 * Caps the calendar-year tabs to the most recent `MAX_CALENDAR_YEARS`
 * years GitHub reports as having contribution history, newest first.
 * Combined with the rolling period this yields "five tabs total".
 */
export function selectCalendarYears(
  contributionYears: readonly number[],
  maxYears = MAX_CALENDAR_YEARS,
): number[] {
  return [...new Set(contributionYears)]
    .sort((a, b) => b - a)
    .slice(0, maxYears);
}

/** Builds the full ordered list of period boundaries: rolling 12 months
 * first, then up to four calendar years (current year is year-to-date,
 * completed years span Jan 1 - Dec 31), most recent year first. */
export function buildPeriodBoundaries(
  now: Date,
  contributionYears: readonly number[],
): PeriodBoundary[] {
  const rolling: PeriodBoundary = {
    id: "last-12-months",
    label: "Last 12 months",
    from: rollingLast12MonthsFrom(now),
    to: now,
  };

  const years = selectCalendarYears(contributionYears);
  const yearPeriods: PeriodBoundary[] = years.map((year) => {
    const isCurrentYear = year === now.getUTCFullYear();
    const { from, to } = isCurrentYear
      ? currentCalendarYearRange(now)
      : completedCalendarYearRange(year);
    return { id: `year-${year}`, label: String(year), from, to };
  });

  return [rolling, ...yearPeriods];
}

/** The Sunday on/before `date` (UTC), i.e. the start of its grid week. */
export function startOfGridWeek(date: Date): Date {
  const day = utcDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  return day;
}

/** GitHub weekday convention: 0 = Sunday .. 6 = Saturday. */
export function weekdayOf(date: Date): number {
  return date.getUTCDay();
}

/** 0-based week column index of `date` within the grid that starts on the
 * Sunday on/before `periodFrom` — matches GitHub's heatmap layout, where
 * the first column may be partially empty if `periodFrom` isn't a Sunday. */
export function weekIndexOf(date: Date, periodFrom: Date): number {
  const gridStart = startOfGridWeek(periodFrom);
  const diffDays = Math.round(
    (date.getTime() - gridStart.getTime()) / MS_PER_DAY,
  );
  return Math.floor(diffDays / 7);
}

/** Inclusive list of UTC calendar dates from `from` to `to`. */
export function enumerateDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  let cursor = utcDate(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
  );
  const last = utcDate(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= last.getTime()) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + MS_PER_DAY);
  }
  return days;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
