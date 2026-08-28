import { describe, expect, it } from "vitest";
import {
  contributionRampColor,
  levelColors,
  waveLevelColor,
  waveLevels,
} from "./palette";

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

describe("waveLevelColor", () => {
  it("returns only its own steps, never a blend", () => {
    for (let i = 0; i <= 100; i++) {
      expect(waveLevels).toContain(waveLevelColor(i / 100));
    }
  });

  // The wave is the only thing that ever showed GitHub's mid swatches,
  // and they are half again as saturated as anything the ramp produces,
  // which is what made the loading state read as neon.
  it("never shows a colour the city itself cannot", () => {
    const cityColours = new Set(
      Array.from({ length: 1001 }, (_, i) => contributionRampColor(i / 1000, true)),
    );
    for (const step of waveLevels.slice(1)) {
      expect(cityColours.has(step)).toBe(true);
    }
    expect(waveLevels).not.toContain(levelColors[2]);
    expect(waveLevels).not.toContain(levelColors[3]);
  });

  it("starts on the ground colour and ends on the deepest green", () => {
    expect(waveLevelColor(0)).toBe(levelColors[0]);
    expect(waveLevelColor(1)).toBe(levelColors[4]);
  });

  it("gives each step an equal slice of the range", () => {
    expect(waveLevelColor(0.1)).toBe(waveLevels[0]);
    expect(waveLevelColor(0.3)).toBe(waveLevels[1]);
    expect(waveLevelColor(0.5)).toBe(waveLevels[2]);
    expect(waveLevelColor(0.7)).toBe(waveLevels[3]);
    expect(waveLevelColor(0.9)).toBe(waveLevels[4]);
  });

  it("clamps rather than reading off the end", () => {
    expect(waveLevelColor(-5)).toBe(waveLevels[0]);
    expect(waveLevelColor(5)).toBe(waveLevels[4]);
  });
});
