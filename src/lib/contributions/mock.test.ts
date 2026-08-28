import { describe, expect, it } from "vitest";
import { MOCK_SEED, buildMockPeriod, randomMockSeed } from "./mock";

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

  it("fills about 95% of the cells, whatever the seed", () => {
    // Every seed, not just the default: the client re-rolls on mount, so
    // an unlucky one must not produce a half-empty city.
    for (let i = 0; i < 40; i++) {
      const period = buildMockPeriod(NOW, i * 7919 + 13);
      const counts = period.days.map((d) => d.count);
      const filled = counts.filter((c) => c > 0).length / counts.length;
      expect(filled).toBeGreaterThan(0.9);
      // Never completely full: the few gaps are what stop it reading as
      // a printed swatch rather than a year someone lived.
      expect(filled).toBeLessThan(0.99);
    }
  });

  it("is skewed rather than a plateau", () => {
    const counts = buildMockPeriod(NOW).days.map((d) => d.count);
    const active = counts.filter((c) => c > 0).sort((a, b) => a - b);
    const median = active[Math.floor(active.length / 2)];
    const max = Math.max(...counts);

    // A few days well above the rest, which is what the sqrt height
    // scale exists to handle.
    expect(max).toBeGreaterThan(10);
    expect(max).toBeGreaterThan(median * 4);
  });

  it("gives a different city for a different seed", () => {
    const a = buildMockPeriod(NOW, MOCK_SEED);
    const b = buildMockPeriod(NOW, 12345);
    expect(a.days.map((d) => d.count)).not.toEqual(b.days.map((d) => d.count));
  });

  it("draws seeds inside the 32-bit range", () => {
    for (let i = 0; i < 200; i++) {
      const seed = randomMockSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(2 ** 32);
    }
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
