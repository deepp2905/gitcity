import type { ContributionDay } from "./types";

/**
 * Pivots the flat, date-ordered day list into the GitHub heatmap layout:
 * seven weekday rows across N week columns. Cells outside the period
 * (the partial first and last weeks) are null.
 */
export type HeatmapGrid = {
  weekCount: number;
  /** cells[weekday][weekIndex] — weekday 0 = Sunday. */
  cells: (ContributionDay | null)[][];
};

export function buildHeatmapGrid(days: readonly ContributionDay[]): HeatmapGrid {
  const weekCount = days.reduce(
    (max, day) => Math.max(max, day.weekIndex + 1),
    0,
  );

  const cells: (ContributionDay | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: weekCount }, () => null),
  );

  for (const day of days) {
    // Guard against out-of-range values from an upstream shape change
    // rather than throwing while rendering.
    if (day.weekday < 0 || day.weekday > 6) continue;
    if (day.weekIndex < 0 || day.weekIndex >= weekCount) continue;
    cells[day.weekday][day.weekIndex] = day;
  }

  return { weekCount, cells };
}

export type MonthLabel = {
  /** Short month name, e.g. "Mar". */
  label: string;
  /** Week column the label sits above. */
  weekIndex: number;
};

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Columns a month must occupy before it earns a label. A rolling period
 * usually starts mid-month, leaving a sliver of the previous month in
 * column 0; labelling it would crowd the next month's label off the
 * strip, so slivers are dropped rather than the real month after them.
 */
const MIN_MONTH_COLUMNS = 2;

/**
 * One label per month, placed above the first week column that month
 * occupies. Months spanning fewer than `MIN_MONTH_COLUMNS` columns are
 * omitted.
 */
export function buildMonthLabels(
  days: readonly ContributionDay[],
): MonthLabel[] {
  const firstDayOfWeekColumn = new Map<number, ContributionDay>();
  for (const day of days) {
    const existing = firstDayOfWeekColumn.get(day.weekIndex);
    if (!existing || day.date < existing.date) {
      firstDayOfWeekColumn.set(day.weekIndex, day);
    }
  }

  // Group consecutive columns into runs of the same month. A run, rather
  // than the month number alone, is the unit here so a 12-month window
  // that starts and ends in the same month labels both ends.
  const runs: { month: number; startColumn: number; columnCount: number }[] = [];

  const sortedColumns = [...firstDayOfWeekColumn.keys()].sort((a, b) => a - b);
  for (const weekIndex of sortedColumns) {
    const day = firstDayOfWeekColumn.get(weekIndex);
    if (!day) continue;

    const month = Number(day.date.slice(5, 7)) - 1;
    const currentRun = runs[runs.length - 1];

    if (currentRun && currentRun.month === month) currentRun.columnCount += 1;
    else runs.push({ month, startColumn: weekIndex, columnCount: 1 });
  }

  return runs
    .filter((run) => run.columnCount >= MIN_MONTH_COLUMNS)
    .map((run) => ({
      label: MONTH_NAMES[run.month],
      weekIndex: run.startColumn,
    }));
}

/** Largest count in the period — the denominator for height/color scales. */
export function maxCountOf(days: readonly ContributionDay[]): number {
  return days.reduce((max, day) => Math.max(max, day.count), 0);
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Wednesday, January 1, 2025" — parsed as UTC so the calendar date
 * never shifts under the viewer's local timezone. */
export function formatDayDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Screen-reader and tooltip text: exact count plus exact date. */
export function formatDayLabel(day: ContributionDay): string {
  const contributions =
    day.count === 1 ? "1 contribution" : `${day.count} contributions`;
  return `${contributions} on ${formatDayDate(day.date)}`;
}
