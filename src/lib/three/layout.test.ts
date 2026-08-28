import { describe, expect, it } from "vitest";
import {
  CELL_SIZE,
  WEEKDAY_COUNT,
  gridDepth,
  gridWidth,
  pitch,
  tilePosition,
  worldHeight,
} from "./layout";
import { DEFAULT_SCENE_CONFIG } from "./config";

const GAP = DEFAULT_SCENE_CONFIG.cellGap;

describe("gridWidth / gridDepth", () => {
  it("has no trailing gap after the last column", () => {
    expect(gridWidth(1)).toBeCloseTo(CELL_SIZE);
    expect(gridWidth(2)).toBeCloseTo(pitch() + CELL_SIZE);
  });

  it("is zero for an empty period", () => {
    expect(gridWidth(0)).toBe(0);
  });

  it("always spans seven weekday rows", () => {
    expect(gridDepth()).toBeCloseTo(WEEKDAY_COUNT * pitch() - GAP);
  });

  it("widens with a larger gap", () => {
    expect(gridWidth(53, 0.5)).toBeGreaterThan(gridWidth(53, 0.1));
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
    expect(b.x - a.x).toBeCloseTo(pitch());
    expect(b.z).toBeCloseTo(a.z);
  });

  it("advances one pitch per weekday along Z", () => {
    const a = tilePosition(0, 0, 53);
    const b = tilePosition(0, 1, 53);
    expect(b.z - a.z).toBeCloseTo(pitch());
    expect(b.x).toBeCloseTo(a.x);
  });

  it("keeps weeks ordered left to right and weekdays front to back", () => {
    expect(tilePosition(5, 0, 53).x).toBeGreaterThan(tilePosition(4, 0, 53).x);
    expect(tilePosition(0, 5, 53).z).toBeGreaterThan(tilePosition(0, 4, 53).z);
  });

  it("stays centred at any gap", () => {
    for (const gap of [0, 0.5, 1]) {
      const first = tilePosition(0, 0, 53, gap);
      const last = tilePosition(52, 6, 53, gap);
      expect(first.x).toBeCloseTo(-last.x);
      expect(first.z).toBeCloseTo(-last.z);
    }
  });
});

describe("worldHeight", () => {
  it("maps the normalized range onto the scene maximum", () => {
    expect(worldHeight(0)).toBe(0);
    expect(worldHeight(1)).toBe(DEFAULT_SCENE_CONFIG.sceneMaxHeight);
    expect(worldHeight(0.5)).toBeCloseTo(
      DEFAULT_SCENE_CONFIG.sceneMaxHeight / 2,
    );
  });

  it("honours an overridden maximum", () => {
    expect(worldHeight(1, 12)).toBe(12);
  });
});
