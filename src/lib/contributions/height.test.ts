import { describe, expect, it } from "vitest";
import { normalizeCount, scaleHeight } from "./height";

describe("normalizeCount", () => {
  it("returns 0 for zero, negative, or an empty period", () => {
    expect(normalizeCount(0, 10)).toBe(0);
    expect(normalizeCount(-3, 10)).toBe(0);
    expect(normalizeCount(5, 0)).toBe(0);
  });

  it("returns 1 at the period maximum under either scale", () => {
    expect(normalizeCount(10, 10, "sqrt")).toBeCloseTo(1);
    expect(normalizeCount(10, 10, "linear")).toBeCloseTo(1);
  });

  it("clamps counts above the maximum", () => {
    expect(normalizeCount(50, 10)).toBeCloseTo(1);
  });

  it("defaults to the square-root scale", () => {
    expect(normalizeCount(1, 100)).toBeCloseTo(normalizeCount(1, 100, "sqrt"));
  });

  it("lifts the low end well above linear", () => {
    // The whole point of the curve: an ordinary day against one busy day.
    expect(normalizeCount(1, 82, "sqrt")).toBeCloseTo(0.11, 2);
    expect(normalizeCount(1, 82, "linear")).toBeCloseTo(0.012, 3);
  });

  it("is monotonic under both scales", () => {
    for (const scale of ["sqrt", "linear"] as const) {
      let previous = -1;
      for (let count = 0; count <= 100; count += 5) {
        const value = normalizeCount(count, 100, scale);
        expect(value).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });

  it("scales by the square root, not proportionally", () => {
    // Doubling the count multiplies height by sqrt(2), not 2.
    const single = normalizeCount(10, 100, "sqrt");
    const double = normalizeCount(20, 100, "sqrt");
    expect(double / single).toBeCloseTo(Math.SQRT2, 5);
  });

  it("is exactly proportional under the linear scale", () => {
    expect(normalizeCount(20, 100, "linear")).toBeCloseTo(
      2 * normalizeCount(10, 100, "linear"),
    );
  });
});

describe("scaleHeight", () => {
  it("puts a normalized 0 on the floor and 1 at full height", () => {
    expect(scaleHeight(0, 0.04)).toBeCloseTo(0.04);
    expect(scaleHeight(1, 0.04)).toBeCloseTo(1);
  });

  it("reserves the floor rather than adding to it", () => {
    // A raised floor compresses the data into what is left, so the same
    // normalized value lands proportionally higher.
    expect(scaleHeight(0.5, 0.04)).toBeCloseTo(0.52);
    expect(scaleHeight(0.5, 0.4)).toBeCloseTo(0.7);
    expect(scaleHeight(1, 0.4)).toBeCloseTo(1);
  });
});
