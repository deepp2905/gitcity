import { describe, expect, it } from "vitest";
import {
  CELL_SIZE,
  PITCH,
  RISE_WAVE_DURATION_MS,
  SCENE_MAX_HEIGHT,
  WEEKDAY_COUNT,
  gridDepth,
  gridWidth,
  riseDelayMs,
  tilePosition,
  worldHeight,
} from "./layout";

describe("gridWidth / gridDepth", () => {
  it("has no trailing gap after the last column", () => {
    expect(gridWidth(1)).toBeCloseTo(CELL_SIZE);
    expect(gridWidth(2)).toBeCloseTo(PITCH + CELL_SIZE);
  });

  it("is zero for an empty period", () => {
    expect(gridWidth(0)).toBe(0);
  });

  it("always spans seven weekday rows", () => {
    expect(gridDepth()).toBeCloseTo(WEEKDAY_COUNT * PITCH - (PITCH - CELL_SIZE));
  });
});

describe("tilePosition", () => {
  it("centres the grid on the origin", () => {
    const weekCount = 53;
    const first = tilePosition(0, 0, weekCount);
    const last = tilePosition(weekCount - 1, WEEKDAY_COUNT - 1, weekCount);

    expect(first.x).toBeCloseTo(-last.x);
    expect(first.z).toBeCloseTo(-last.z);
  });

  it("advances one pitch per week along X", () => {
    const a = tilePosition(0, 0, 53);
    const b = tilePosition(1, 0, 53);
    expect(b.x - a.x).toBeCloseTo(PITCH);
    expect(b.z).toBeCloseTo(a.z);
  });

  it("advances one pitch per weekday along Z", () => {
    const a = tilePosition(0, 0, 53);
    const b = tilePosition(0, 1, 53);
    expect(b.z - a.z).toBeCloseTo(PITCH);
    expect(b.x).toBeCloseTo(a.x);
  });

  it("keeps weeks ordered left to right and weekdays front to back", () => {
    expect(tilePosition(5, 0, 53).x).toBeGreaterThan(tilePosition(4, 0, 53).x);
    expect(tilePosition(0, 5, 53).z).toBeGreaterThan(tilePosition(0, 4, 53).z);
  });
});

describe("worldHeight", () => {
  it("maps the normalized range onto the scene maximum", () => {
    expect(worldHeight(0)).toBe(0);
    expect(worldHeight(1)).toBe(SCENE_MAX_HEIGHT);
    expect(worldHeight(0.5)).toBeCloseTo(SCENE_MAX_HEIGHT / 2);
  });
});

describe("riseDelayMs", () => {
  it("starts the first week immediately and ends the last at the full wave", () => {
    expect(riseDelayMs(0, 53)).toBe(0);
    expect(riseDelayMs(52, 53)).toBeCloseTo(RISE_WAVE_DURATION_MS);
  });

  it("spreads the same budget regardless of period length", () => {
    expect(riseDelayMs(9, 10)).toBeCloseTo(RISE_WAVE_DURATION_MS);
    expect(riseDelayMs(4, 10)).toBeCloseTo(RISE_WAVE_DURATION_MS * (4 / 9));
  });

  it("handles a single-column period without dividing by zero", () => {
    expect(riseDelayMs(0, 1)).toBe(0);
    expect(riseDelayMs(0, 0)).toBe(0);
  });
});
