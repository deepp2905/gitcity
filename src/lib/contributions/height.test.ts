import { describe, expect, it } from "vitest";
import {
  BUILDING_MAX_HEIGHT,
  BUILDING_MIN_HEIGHT,
  GROUND_TILE_HEIGHT,
  computeBuildingHeight,
} from "./height";

describe("computeBuildingHeight", () => {
  it("keeps zero-contribution days as thin ground tiles", () => {
    expect(computeBuildingHeight(0, 10)).toBe(GROUND_TILE_HEIGHT);
  });

  it("treats negative counts defensively as ground tiles", () => {
    expect(computeBuildingHeight(-3, 10)).toBe(GROUND_TILE_HEIGHT);
  });

  it("falls back to a ground tile for an empty period (maxCount 0)", () => {
    expect(computeBuildingHeight(0, 0)).toBe(GROUND_TILE_HEIGHT);
  });

  it("reaches the fixed scene maximum at the period's max count", () => {
    expect(computeBuildingHeight(10, 10)).toBeCloseTo(BUILDING_MAX_HEIGHT);
  });

  it("applies sqrt(count / maxCount) between the min and max height", () => {
    // sqrt(1/100) = 0.1
    const expected = BUILDING_MIN_HEIGHT + 0.1 * (BUILDING_MAX_HEIGHT - BUILDING_MIN_HEIGHT);
    expect(computeBuildingHeight(1, 100)).toBeCloseTo(expected);
  });

  it("never drops a real building below the minimum height", () => {
    expect(computeBuildingHeight(1, 1000)).toBeGreaterThanOrEqual(
      BUILDING_MIN_HEIGHT,
    );
  });

  it("is monotonically non-decreasing as count increases", () => {
    const maxCount = 50;
    let previous = 0;
    for (let count = 0; count <= maxCount; count++) {
      const height = computeBuildingHeight(count, maxCount);
      expect(height).toBeGreaterThanOrEqual(previous);
      previous = height;
    }
  });

  it("grows sub-linearly (sqrt curve rewards low counts relatively more)", () => {
    const quarter = computeBuildingHeight(25, 100);
    const full = computeBuildingHeight(100, 100);
    const quarterFraction =
      (quarter - BUILDING_MIN_HEIGHT) / (full - BUILDING_MIN_HEIGHT);
    // sqrt(25/100) = 0.5, not 0.25 — confirms the curve isn't linear.
    expect(quarterFraction).toBeCloseTo(0.5);
  });
});
