import { describe, expect, it } from "vitest";
import { createBuildingGeometry } from "./building-geometry";
import { CELL_SIZE } from "./layout";

describe("createBuildingGeometry", () => {
  it("is centred on the origin like BoxGeometry", () => {
    // Instances are scaled by their height and positioned at height/2,
    // which only puts them on the ground when the geometry is centred.
    // An off-centre origin floats every building by its own height.
    const geometry = createBuildingGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;

    expect(box).not.toBeNull();
    expect(box!.min.y).toBeCloseTo(-0.5, 5);
    expect(box!.max.y).toBeCloseTo(0.5, 5);
  });

  it("occupies exactly one cell in plan", () => {
    const geometry = createBuildingGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;

    expect(box.max.x - box.min.x).toBeCloseTo(CELL_SIZE, 5);
    expect(box.max.z - box.min.z).toBeCloseTo(CELL_SIZE, 5);
    expect(box.min.x).toBeCloseTo(-CELL_SIZE / 2, 5);
    expect(box.min.z).toBeCloseTo(-CELL_SIZE / 2, 5);
  });

  it("sits on the ground once scaled and positioned like an instance", () => {
    const geometry = createBuildingGeometry();
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;

    for (const height of [0.25, 1, 6]) {
      const bottom = box.min.y * height + height / 2;
      const top = box.max.y * height + height / 2;
      expect(bottom).toBeCloseTo(0, 5);
      expect(top).toBeCloseTo(height, 5);
    }
  });

  it("rounds the vertical corners without touching the footprint size", () => {
    const geometry = createBuildingGeometry();
    const position = geometry.getAttribute("position");

    // A plain box has 4 distinct plan corners at (+-0.5, +-0.5); rounding
    // replaces each with an arc, so there must be more distinct outline
    // points than a box would have.
    const outline = new Set<string>();
    for (let i = 0; i < position.count; i++) {
      outline.add(
        `${position.getX(i).toFixed(3)},${position.getZ(i).toFixed(3)}`,
      );
    }
    expect(outline.size).toBeGreaterThan(4);
  });
});
