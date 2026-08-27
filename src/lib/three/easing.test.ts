import { describe, expect, it } from "vitest";
import { cubicBezier } from "./easing";
import { easeInOutCubic } from "./camera";

describe("cubicBezier", () => {
  it("pins both endpoints", () => {
    const ease = cubicBezier(0.645, 0.045, 0.355, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    const ease = cubicBezier(0.645, 0.045, 0.355, 1);
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it("is monotonic", () => {
    const ease = cubicBezier(0.645, 0.045, 0.355, 1);
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const value = ease(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("solves x(t) accurately against the curve's own definition", () => {
    // Independent check: for a known internal t, the curve passes through
    // (x(t), y(t)), so easing x(t) must return y(t).
    const [x1, y1, x2, y2] = [0.645, 0.045, 0.355, 1];
    const ease = cubicBezier(x1, y1, x2, y2);
    const axis = (t: number, a1: number, a2: number) => {
      const c = 3 * a1;
      const b = 3 * (a2 - a1) - c;
      const a = 1 - c - b;
      return ((a * t + b) * t + c) * t;
    };

    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(ease(axis(t, x1, x2))).toBeCloseTo(axis(t, y1, y2), 4);
    }
  });

  it("reproduces a linear curve exactly", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.3, 0.5, 0.77, 1]) {
      expect(linear(t)).toBeCloseTo(t, 6);
    }
  });

  it("eases in and out: slow at both ends, fast in the middle", () => {
    const ease = cubicBezier(0.645, 0.045, 0.355, 1);
    const startSlope = ease(0.1) / 0.1;
    const midSlope = (ease(0.55) - ease(0.45)) / 0.1;
    const endSlope = (1 - ease(0.9)) / 0.1;

    expect(midSlope).toBeGreaterThan(startSlope);
    expect(midSlope).toBeGreaterThan(endSlope);
  });
});

describe("easeInOutCubic", () => {
  it("is the CSS token curve", () => {
    const token = cubicBezier(0.645, 0.045, 0.355, 1);
    for (const t of [0, 0.15, 0.4, 0.6, 0.85, 1]) {
      expect(easeInOutCubic(t)).toBeCloseTo(token(t), 6);
    }
  });
});
