import { describe, expect, it } from "vitest";
import {
  buildPeriodBoundaries,
  completedCalendarYearRange,
  currentCalendarYearRange,
  enumerateDays,
  rollingLast12MonthsFrom,
  selectCalendarYears,
  startOfGridWeek,
  toIsoDate,
  weekIndexOf,
  weekdayOf,
} from "./periods";

describe("rollingLast12MonthsFrom", () => {
  it("returns the same month/day one year earlier", () => {
    const now = new Date(Date.UTC(2026, 7, 26, 12, 0, 0));
    expect(rollingLast12MonthsFrom(now).toISOString()).toBe(
      new Date(Date.UTC(2025, 7, 26, 12, 0, 0)).toISOString(),
    );
  });

  it("normalizes Feb 29 into a non-leap target year (matches Date/GitHub behavior)", () => {
    const now = new Date(Date.UTC(2024, 1, 29, 0, 0, 0)); // 2024 is a leap year
    // One year earlier, 2023, has no Feb 29 — it rolls forward to Mar 1.
    expect(rollingLast12MonthsFrom(now).toISOString()).toBe(
      new Date(Date.UTC(2023, 2, 1, 0, 0, 0)).toISOString(),
    );
  });
});

describe("calendar year ranges", () => {
  it("spans Jan 1 - Dec 31 for a completed year", () => {
    const { from, to } = completedCalendarYearRange(2023);
    expect(toIsoDate(from)).toBe("2023-01-01");
    expect(to.toISOString()).toBe("2023-12-31T23:59:59.999Z");
  });

  it("spans Jan 1 - now for the current (year-to-date) year", () => {
    const now = new Date(Date.UTC(2026, 4, 15, 9, 30, 0));
    const { from, to } = currentCalendarYearRange(now);
    expect(toIsoDate(from)).toBe("2026-01-01");
    expect(to).toEqual(now);
  });
});

describe("selectCalendarYears", () => {
  it("caps to the four most recent years, newest first", () => {
    expect(selectCalendarYears([2020, 2021, 2022, 2023, 2024, 2025, 2026])).toEqual(
      [2026, 2025, 2024, 2023],
    );
  });

  it("returns all years when fewer than the cap are available", () => {
    expect(selectCalendarYears([2025, 2026])).toEqual([2026, 2025]);
  });

  it("de-duplicates years", () => {
    expect(selectCalendarYears([2026, 2026, 2025])).toEqual([2026, 2025]);
  });

  it("returns an empty list for a brand-new account with no history", () => {
    expect(selectCalendarYears([])).toEqual([]);
  });
});

describe("buildPeriodBoundaries", () => {
  const now = new Date(Date.UTC(2026, 7, 26, 12, 0, 0));

  it("produces five tabs total: rolling + four calendar years", () => {
    const boundaries = buildPeriodBoundaries(now, [
      2022, 2023, 2024, 2025, 2026,
    ]);
    expect(boundaries.map((b) => b.id)).toEqual([
      "last-12-months",
      "year-2026",
      "year-2025",
      "year-2024",
      "year-2023",
    ]);
    expect(boundaries.map((b) => b.label)).toEqual([
      "Last 12 months",
      "2026",
      "2025",
      "2024",
      "2023",
    ]);
  });

  it("makes the current year year-to-date and completed years Jan 1 - Dec 31", () => {
    const [, currentYear, priorYear] = buildPeriodBoundaries(now, [2026, 2025]);
    expect(toIsoDate(currentYear.from)).toBe("2026-01-01");
    expect(currentYear.to).toEqual(now);
    expect(toIsoDate(priorYear.from)).toBe("2025-01-01");
    expect(priorYear.to.toISOString()).toBe("2025-12-31T23:59:59.999Z");
  });

  it("only includes the rolling period when there is no contribution history", () => {
    expect(buildPeriodBoundaries(now, [])).toHaveLength(1);
    expect(buildPeriodBoundaries(now, []).map((b) => b.id)).toEqual([
      "last-12-months",
    ]);
  });
});

describe("weekdayOf", () => {
  it("matches known real-world weekdays (0 = Sunday)", () => {
    // Jan 1 2023 was a Sunday; 2023 is not a leap year, so Jan 1 2024 is
    // a Monday and Dec 31 2023 is the Sunday right before it.
    expect(weekdayOf(new Date(Date.UTC(2023, 0, 1)))).toBe(0);
    expect(weekdayOf(new Date(Date.UTC(2024, 0, 1)))).toBe(1);
    expect(weekdayOf(new Date(Date.UTC(2023, 11, 31)))).toBe(0);
  });
});

describe("startOfGridWeek", () => {
  it("returns the same date when it's already a Sunday", () => {
    const sunday = new Date(Date.UTC(2023, 0, 1));
    expect(toIsoDate(startOfGridWeek(sunday))).toBe("2023-01-01");
  });

  it("returns the preceding Sunday for a mid-week date", () => {
    const monday = new Date(Date.UTC(2024, 0, 1));
    expect(toIsoDate(startOfGridWeek(monday))).toBe("2023-12-31");
  });
});

describe("weekIndexOf", () => {
  it("places the period start in week 0", () => {
    const periodFrom = new Date(Date.UTC(2023, 0, 1)); // Sunday
    expect(weekIndexOf(periodFrom, periodFrom)).toBe(0);
  });

  it("advances one column per 7 days from the grid start", () => {
    const periodFrom = new Date(Date.UTC(2023, 0, 1)); // Sunday
    const oneWeekLater = new Date(Date.UTC(2023, 0, 8));
    expect(weekIndexOf(oneWeekLater, periodFrom)).toBe(1);
  });

  it("keeps a mid-week period start in week 0 even though its Sunday is earlier", () => {
    const periodFrom = new Date(Date.UTC(2024, 0, 1)); // Monday
    expect(weekIndexOf(periodFrom, periodFrom)).toBe(0);
  });

  it("matches the full-year week count for a completed year", () => {
    const periodFrom = new Date(Date.UTC(2023, 0, 1)); // Sunday
    const dec31 = new Date(Date.UTC(2023, 11, 31));
    expect(weekIndexOf(dec31, periodFrom)).toBe(52);
  });
});

describe("enumerateDays", () => {
  it("is inclusive of both endpoints", () => {
    const days = enumerateDays(
      new Date(Date.UTC(2024, 0, 1)),
      new Date(Date.UTC(2024, 0, 3)),
    );
    expect(days.map(toIsoDate)).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });

  it("counts 366 days for a leap year and 365 for a non-leap year", () => {
    const leap = completedCalendarYearRange(2024);
    const nonLeap = completedCalendarYearRange(2023);
    expect(enumerateDays(leap.from, leap.to)).toHaveLength(366);
    expect(enumerateDays(nonLeap.from, nonLeap.to)).toHaveLength(365);
  });
});
