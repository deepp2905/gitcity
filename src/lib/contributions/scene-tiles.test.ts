import { describe, expect, it } from "vitest";
import { buildSceneTiles, sceneWeekCount } from "./scene-tiles";
import type { ContributionDay, ContributionPeriod } from "./types";

function day(date: string, count = 1): ContributionDay {
  const parsed = new Date(`${date}T00:00:00Z`);
  return {
    date,
    count,
    level: count > 0 ? "FIRST_QUARTILE" : "NONE",
    weekday: parsed.getUTCDay(),
    weekIndex: 0,
  };
}

function period(
  id: ContributionPeriod["id"],
  days: ContributionDay[],
): ContributionPeriod {
  return {
    id,
    label: String(id),
    from: days[0]?.date ?? "2026-01-01",
    to: days[days.length - 1]?.date ?? "2026-01-01",
    totalContributions: days.reduce((sum, d) => sum + d.count, 0),
    days,
  };
}

describe("buildSceneTiles", () => {
  it("pads a year in progress out to the full calendar year", () => {
    const partial = period("year-2026", [
      day("2026-01-01"),
      day("2026-06-15"),
      day("2026-08-26"),
    ]);
    const tiles = buildSceneTiles(partial);

    expect(tiles).toHaveLength(365); // 2026 is not a leap year
    expect(tiles.filter((t) => t.day !== null)).toHaveLength(3);
    expect(tiles.filter((t) => t.day === null)).toHaveLength(362);
  });

  it("gives a partial year the same footprint as a completed one", () => {
    const partial = buildSceneTiles(period("year-2026", [day("2026-01-01")]));
    const complete = buildSceneTiles(period("year-2025", [day("2025-01-01")]));

    // 2025 starts on a Wednesday and 2026 on a Thursday, so both span 53
    // grid columns — the point is that neither is truncated.
    expect(sceneWeekCount(partial)).toBe(sceneWeekCount(complete));
  });

  it("pads a leap year to 366 tiles", () => {
    const tiles = buildSceneTiles(period("year-2024", [day("2024-03-01")]));
    expect(tiles).toHaveLength(366);
  });

  it("keeps real days addressable by date", () => {
    const tiles = buildSceneTiles(period("year-2026", [day("2026-06-15", 7)]));
    const real = tiles.filter((t) => t.day !== null);
    expect(real).toHaveLength(1);
    expect(real[0].day?.date).toBe("2026-06-15");
    expect(real[0].day?.count).toBe(7);
  });

  it("places tiles on the calendar year's own grid, not the payload's", () => {
    // Jan 1 2026 is a Thursday, so it sits in column 0 at weekday 4.
    const tiles = buildSceneTiles(period("year-2026", [day("2026-01-01")]));
    const first = tiles[0];
    expect(first.weekIndex).toBe(0);
    expect(first.weekday).toBe(4);
  });

  it("leaves the rolling period untouched", () => {
    const rolling = period("last-12-months", [
      day("2025-08-26"),
      day("2026-08-26"),
    ]);
    const tiles = buildSceneTiles(rolling);
    expect(tiles).toHaveLength(2);
    expect(tiles.every((t) => t.day !== null)).toBe(true);
  });

  it("pads an entirely empty year to a full grid of blanks", () => {
    const tiles = buildSceneTiles(period("year-2025", []));
    expect(tiles).toHaveLength(365);
    expect(tiles.every((t) => t.day === null)).toBe(true);
  });
});

describe("sceneWeekCount", () => {
  it("counts columns from the highest week index", () => {
    expect(
      sceneWeekCount([
        { day: null, date: "2026-01-04", weekIndex: 0, weekday: 0 },
        { day: null, date: "2026-12-30", weekIndex: 52, weekday: 3 },
      ]),
    ).toBe(53);
  });

  it("is zero for no tiles", () => {
    expect(sceneWeekCount([])).toBe(0);
  });
});
