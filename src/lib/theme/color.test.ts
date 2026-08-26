import { describe, expect, it } from "vitest";
import {
  hexToRgb,
  lerpOklch,
  oklchToRgb,
  rgbToHex,
  rgbToOklch,
} from "./color";
import { contributionRampColor, levelColors } from "./palette";

describe("hex <-> rgb", () => {
  it("round-trips", () => {
    expect(rgbToHex(hexToRgb("#9be9a8"))).toBe("#9be9a8");
    expect(rgbToHex(hexToRgb("#216e39"))).toBe("#216e39");
  });
});

describe("rgb <-> oklch", () => {
  it("round-trips in-gamut colors", () => {
    for (const hex of ["#9be9a8", "#40c463", "#30a14e", "#216e39"]) {
      expect(rgbToHex(oklchToRgb(rgbToOklch(hexToRgb(hex))))).toBe(hex);
    }
  });

  it("gives white maximum lightness and no chroma", () => {
    const white = rgbToOklch({ r: 1, g: 1, b: 1 });
    expect(white.l).toBeCloseTo(1, 2);
    expect(white.c).toBeCloseTo(0, 3);
  });

  it("orders the GitHub greens by descending lightness", () => {
    const lightness = ["#9be9a8", "#40c463", "#30a14e", "#216e39"].map(
      (hex) => rgbToOklch(hexToRgb(hex)).l,
    );
    for (let i = 1; i < lightness.length; i++) {
      expect(lightness[i]).toBeLessThan(lightness[i - 1]);
    }
  });

  it("clamps out-of-gamut results instead of producing NaN", () => {
    const rgb = oklchToRgb({ l: 0.9, c: 0.4, h: 140 });
    for (const channel of [rgb.r, rgb.g, rgb.b]) {
      expect(Number.isFinite(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});

describe("lerpOklch", () => {
  const from = rgbToOklch(hexToRgb("#9be9a8"));
  const to = rgbToOklch(hexToRgb("#216e39"));

  it("returns the endpoints exactly", () => {
    expect(rgbToHex(oklchToRgb(lerpOklch(from, to, 0)))).toBe("#9be9a8");
    expect(rgbToHex(oklchToRgb(lerpOklch(from, to, 1)))).toBe("#216e39");
  });

  it("clamps out-of-range t", () => {
    expect(rgbToHex(oklchToRgb(lerpOklch(from, to, -1)))).toBe("#9be9a8");
    expect(rgbToHex(oklchToRgb(lerpOklch(from, to, 5)))).toBe("#216e39");
  });

  it("takes the short way around the hue circle", () => {
    const result = lerpOklch({ l: 0.5, c: 0.1, h: 350 }, { l: 0.5, c: 0.1, h: 10 }, 0.5);
    // Midpoint should be 0, not 180.
    expect(Math.min(result.h, 360 - result.h)).toBeCloseTo(0, 1);
  });

  it("stays saturated through the middle, unlike an sRGB lerp", () => {
    const mid = lerpOklch(from, to, 0.5);
    expect(mid.c).toBeGreaterThan(Math.min(from.c, to.c) * 0.9);
  });
});

describe("contributionRampColor", () => {
  it("uses the neutral ground color for days with no contributions", () => {
    expect(contributionRampColor(0, false)).toBe(levelColors[0]);
    expect(contributionRampColor(0.8, false)).toBe(levelColors[0]);
  });

  it("spans the light and deep greens across the normalized range", () => {
    expect(contributionRampColor(0, true)).toBe(levelColors[1]);
    expect(contributionRampColor(1, true)).toBe(levelColors[4]);
  });

  it("darkens monotonically as the normalized value rises", () => {
    let previous = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const lightness = rgbToOklch(hexToRgb(contributionRampColor(t, true))).l;
      expect(lightness).toBeLessThanOrEqual(previous + 1e-9);
      previous = lightness;
    }
  });

  it("separates counts that GitHub's buckets would collapse together", () => {
    // Real case: max 82, with 1 and 18 contributions both landing in
    // FIRST_QUARTILE. sqrt(1/82) vs sqrt(18/82).
    const low = contributionRampColor(Math.sqrt(1 / 82), true);
    const high = contributionRampColor(Math.sqrt(18 / 82), true);
    expect(low).not.toBe(high);

    const delta =
      rgbToOklch(hexToRgb(low)).l - rgbToOklch(hexToRgb(high)).l;
    // A clearly perceptible lightness gap, not a hairline difference.
    expect(delta).toBeGreaterThan(0.05);
  });
});
