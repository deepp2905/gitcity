import { describe, expect, it } from "vitest";
import { contributionRampColor, levelColors } from "./palette";

const HEX = /^#[0-9a-f]{6}$/;

describe("contributionRampColor", () => {
  it("returns the ground colour for a day with no contributions", () => {
    expect(contributionRampColor(0, false)).toBe(levelColors[0]);
  });

  it("returns well-formed hex across the whole range", () => {
    // A malformed string here renders as an unparseable colour, which is
    // how a whole grid can end up the wrong shade.
    for (let i = 0; i <= 100; i++) {
      const color = contributionRampColor(i / 100, true);
      expect(color).toMatch(HEX);
    }
  });

  it("survives out-of-range and non-finite input", () => {
    for (const value of [-1, 2, NaN, Infinity]) {
      expect(contributionRampColor(value, true)).toMatch(HEX);
    }
  });

  it("darkens as the normalized value rises", () => {
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(luminance(contributionRampColor(1, true))).toBeLessThan(
      luminance(contributionRampColor(0.1, true)),
    );
  });

  it("never returns black", () => {
    for (let i = 0; i <= 20; i++) {
      expect(contributionRampColor(i / 20, true)).not.toBe("#000000");
    }
  });
});
