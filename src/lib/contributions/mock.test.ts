import { describe, expect, it } from "vitest";
import { buildMockPeriod } from "./mock";

const NOW = new Date("2026-08-27T12:00:00Z");

describe("buildMockPeriod", () => {
  it("is deterministic, so it can't cause a hydration mismatch", () => {
    const a = buildMockPeriod(NOW);
    const b = buildMockPeriod(NOW);
    expect(a.days.map((d) => d.count)).toEqual(b.days.map((d) => d.count));
    expect(a.totalContributions).toBe(b.totalContributions);
  });

  it("covers a rolling year with valid grid coordinates", () => {
    const period = buildMockPeriod(NOW);
    expect(period.days.length).toBeGreaterThan(360);
    expect(period.days.length).toBeLessThan(372);

    for (const day of period.days) {
      expect(day.weekday).toBeGreaterThanOrEqual(0);
      expect(day.weekday).toBeLessThanOrEqual(6);
      expect(day.weekIndex).toBeGreaterThanOrEqual(0);
      expect(day.count).toBeGreaterThanOrEqual(0);
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("totals its own days", () => {
    const period = buildMockPeriod(NOW);
    const summed = period.days.reduce((sum, day) => sum + day.count, 0);
    expect(period.totalContributions).toBe(summed);
  });

  it("looks like a contribution graph rather than noise", () => {
    const period = buildMockPeriod(NOW);
    const counts = period.days.map((d) => d.count);
    const active = counts.filter((c) => c > 0);
    const max = Math.max(...counts);

    // Sparse enough to read as a real year, busy enough to be a city.
    expect(active.length / counts.length).toBeGreaterThan(0.2);
    expect(active.length / counts.length).toBeLessThan(0.85);
    // Skewed: a few days well above the rest, which is what the sqrt
    // height scale exists to handle.
    expect(max).toBeGreaterThan(10);
  });

  it("is quieter at weekends than midweek", () => {
    const period = buildMockPeriod(NOW);
    const mean = (weekday: number) => {
      const days = period.days.filter((d) => d.weekday === weekday);
      return days.reduce((sum, d) => sum + d.count, 0) / days.length;
    };
    const weekend = (mean(0) + mean(6)) / 2;
    const midweek = (mean(2) + mean(3)) / 2;
    expect(weekend).toBeLessThan(midweek);
  });

  it("assigns every level from its own maximum", () => {
    const period = buildMockPeriod(NOW);
    const levels = new Set(period.days.map((d) => d.level));
    expect(levels.has("NONE")).toBe(true);
    expect(levels.has("FOURTH_QUARTILE")).toBe(true);
  });
});
