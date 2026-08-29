import { describe, expect, it } from "vitest";
import {
  buildHeatmapGrid,
  buildMonthLabels,
  formatDayDate,
  formatDayLabel,
  maxCountOf,
} from "./grid";
import type { ContributionDay } from "./types";

function day(
  date: string,
  count: number,
  weekday: number,
  weekIndex: number,
): ContributionDay {
  return { date, count, level: "NONE", weekday, weekIndex };
}

describe("buildHeatmapGrid", () => {
  it("always produces seven weekday rows", () => {
    const grid = buildHeatmapGrid([day("2025-01-01", 1, 3, 0)]);
    expect(grid.cells).toHaveLength(7);
  });

  it("places days at [weekday][weekIndex]", () => {
    const wednesday = day("2025-01-01", 5, 3, 0);
    const nextWednesday = day("2025-01-08", 9, 3, 1);
    const grid = buildHeatmapGrid([wednesday, nextWednesday]);

    expect(grid.cells[3][0]).toBe(wednesday);
    expect(grid.cells[3][1]).toBe(nextWednesday);
  });

  it("leaves the partial first week's leading cells empty", () => {
    // 2025-01-01 was a Wednesday, so Sun/Mon/Tue of week 0 are outside
    // the period and must stay null.
    const grid = buildHeatmapGrid([day("2025-01-01", 1, 3, 0)]);
    expect(grid.cells[0][0]).toBeNull();
    expect(grid.cells[1][0]).toBeNull();
    expect(grid.cells[2][0]).toBeNull();
    expect(grid.cells[3][0]).not.toBeNull();
  });

  it("sizes the grid from the highest week index", () => {
    const grid = buildHeatmapGrid([
      day("2025-01-01", 1, 3, 0),
      day("2025-12-31", 1, 3, 52),
    ]);
    expect(grid.weekCount).toBe(53);
    expect(grid.cells[0]).toHaveLength(53);
  });

  it("ignores out-of-range weekday or week index instead of throwing", () => {
    const grid = buildHeatmapGrid([
      day("2025-01-01", 1, 3, 0),
      day("2025-01-02", 1, 9, 0),
      day("2025-01-03", 1, 3, -1),
    ]);
    expect(grid.weekCount).toBe(1);
    expect(grid.cells[3][0]?.date).toBe("2025-01-01");
  });

  it("returns an empty grid for an empty period", () => {
    const grid = buildHeatmapGrid([]);
    expect(grid.weekCount).toBe(0);
    expect(grid.cells).toHaveLength(7);
    expect(grid.cells[0]).toHaveLength(0);
  });
});

describe("buildMonthLabels", () => {
  /** One day per week column, so each entry defines that column's month. */
  function columns(...dates: string[]): ContributionDay[] {
    return dates.map((date, weekIndex) => day(date, 0, 0, weekIndex));
  }

  it("emits one label per month at its first week column", () => {
    // Four columns each, as a real calendar month spans -- shorter runs
    // only occur where the window was cut, and are dropped.
    const days = columns(
      "2025-01-05",
      "2025-01-12",
      "2025-01-19",
      "2025-01-26",
      "2025-02-02",
      "2025-02-09",
      "2025-02-16",
      "2025-02-23",
      "2025-03-02",
      "2025-03-09",
      "2025-03-16",
      "2025-03-23",
    );
    expect(buildMonthLabels(days)).toEqual([
      { label: "Jan", weekIndex: 0 },
      { label: "Feb", weekIndex: 4 },
      { label: "Mar", weekIndex: 8 },
    ]);
  });

  it("drops a leading sliver month rather than the real month after it", () => {
    // A rolling period starting Aug 31: August owns only column 0, so
    // September must still get its label at column 1.
    const days = columns(
      "2025-08-31",
      "2025-09-07",
      "2025-09-14",
      "2025-09-21",
      "2025-09-28",
      "2025-10-05",
      "2025-10-12",
      "2025-10-19",
    );
    expect(buildMonthLabels(days)).toEqual([
      { label: "Sep", weekIndex: 1 },
      { label: "Oct", weekIndex: 5 },
    ]);
  });

  it("labels both ends when a 12-month window opens and closes in one month", () => {
    const days = columns(
      "2025-09-07",
      "2025-09-14",
      "2025-09-21",
      "2025-10-05",
      "2025-10-12",
      "2025-10-19",
      "2026-09-06",
      "2026-09-13",
      "2026-09-20",
    );
    expect(buildMonthLabels(days)).toEqual([
      { label: "Sep", weekIndex: 0 },
      { label: "Oct", weekIndex: 3 },
      { label: "Sep", weekIndex: 6 },
    ]);
  });

  it("drops a two-column sliver, not just a one-column one", () => {
    // The reported case: a rolling year opening Aug 28 puts Aug in
    // columns 0 and 1 and Sep at column 2. Two columns is about 27px at
    // a desktop zoom, and a centred "Aug" is about 24px wide, so the two
    // labels touched.
    const days = columns(
      "2025-08-28",
      "2025-08-31",
      "2025-09-07",
      "2025-09-14",
      "2025-09-21",
      "2025-09-28",
    );
    expect(buildMonthLabels(days)).toEqual([{ label: "Sep", weekIndex: 2 }]);
  });

  it("returns no labels for an empty period", () => {
    expect(buildMonthLabels([])).toEqual([]);
  });
});

describe("maxCountOf", () => {
  it("finds the largest count", () => {
    expect(
      maxCountOf([day("2025-01-01", 3, 3, 0), day("2025-01-02", 17, 4, 0)]),
    ).toBe(17);
  });

  it("returns 0 for an empty period", () => {
    expect(maxCountOf([])).toBe(0);
  });
});

describe("formatDayDate", () => {
  it("formats in UTC so the calendar date never shifts", () => {
    expect(formatDayDate("2025-01-01")).toBe("Wednesday, January 1, 2025");
    expect(formatDayDate("2024-02-29")).toBe("Thursday, February 29, 2024");
  });
});

describe("formatDayLabel", () => {
  it("uses the singular for exactly one contribution", () => {
    expect(formatDayLabel(day("2025-01-01", 1, 3, 0))).toBe(
      "1 contribution on Wednesday, January 1, 2025",
    );
  });

  it("uses the plural for zero and for many", () => {
    expect(formatDayLabel(day("2025-01-01", 0, 3, 0))).toBe(
      "0 contributions on Wednesday, January 1, 2025",
    );
    expect(formatDayLabel(day("2025-01-01", 12, 3, 0))).toBe(
      "12 contributions on Wednesday, January 1, 2025",
    );
  });
});
