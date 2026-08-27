import { describe, expect, it } from "vitest";
import { WAVE_WAVELENGTH_COLUMNS, columnJitter, waveAt } from "./wave";

describe("columnJitter", () => {
  it("is stable for a given column", () => {
    expect(columnJitter(17)).toBe(columnJitter(17));
  });

  it("differs between columns", () => {
    expect(columnJitter(3)).not.toBe(columnJitter(4));
  });

  it("stays within -1..1", () => {
    for (let i = 0; i < 60; i++) {
      expect(Math.abs(columnJitter(i))).toBeLessThanOrEqual(1);
    }
  });
});

describe("waveAt", () => {
  it("stays within 0..1 for any column and time", () => {
    for (let column = 0; column < 53; column++) {
      for (let t = 0; t < 4; t += 0.1) {
        const value = waveAt(column, t);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("travels: a column's value changes over time", () => {
    const samples = [0, 0.25, 0.5, 0.75].map((t) => waveAt(10, t));
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it("offsets neighbouring columns, so it reads as a front", () => {
    expect(waveAt(0, 0, 0)).not.toBeCloseTo(waveAt(4, 0, 0), 2);
  });

  it("repeats every wavelength when jitter is off", () => {
    // Without the per-column jitter the wave is a pure sine, so columns a
    // full wavelength apart sit at the same point in the cycle.
    expect(waveAt(0, 0, 0)).toBeCloseTo(waveAt(WAVE_WAVELENGTH_COLUMNS, 0, 0), 5);
  });

  it("is deterministic for the same inputs", () => {
    expect(waveAt(7, 1.5)).toBe(waveAt(7, 1.5));
  });

  it("adds variation that a pure sine would not have", () => {
    const pure = waveAt(5, 0.3, 0);
    const jittered = waveAt(5, 0.3);
    expect(jittered).not.toBe(pure);
  });
});
