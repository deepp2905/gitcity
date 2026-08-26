import { describe, expect, it } from "vitest";
import {
  CITY_VIEW,
  FLAT_VIEW,
  columnProgress,
  easeInOutCubic,
  fitZoom,
  lerpView,
  projectFlat,
  sphericalToCartesian,
} from "./camera";

describe("sphericalToCartesian", () => {
  it("puts phi=0 directly overhead", () => {
    const p = sphericalToCartesian(0, 0, 100);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(100);
    expect(p.z).toBeCloseTo(0);
  });

  it("keeps the flat view essentially overhead", () => {
    const p = sphericalToCartesian(FLAT_VIEW.phi, FLAT_VIEW.theta, 100);
    // 2 degrees off vertical: height is within 0.1% of the radius, so the
    // view reads as straight down.
    expect(p.y / 100).toBeGreaterThan(0.999);
    expect(Math.abs(p.x)).toBeLessThan(0.1);
  });

  it("preserves radius at any angle", () => {
    const p = sphericalToCartesian(CITY_VIEW.phi, CITY_VIEW.theta, 100);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(100);
  });

  it("stays above the ground plane at the tilted view", () => {
    const p = sphericalToCartesian(CITY_VIEW.phi, CITY_VIEW.theta, 100);
    expect(p.y).toBeGreaterThan(0);
  });
});

describe("easeInOutCubic", () => {
  it("pins the endpoints and the midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it("clamps out-of-range input", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it("starts slower than linear and is monotonic", () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    let previous = 0;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easeInOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("lerpView", () => {
  it("returns the flat view at 0 and the city view at 1", () => {
    expect(lerpView(0)).toEqual(FLAT_VIEW);
    const end = lerpView(1);
    expect(end.phi).toBeCloseTo(CITY_VIEW.phi);
    expect(end.theta).toBeCloseTo(CITY_VIEW.theta);
    expect(end.zoomScale).toBeCloseTo(CITY_VIEW.zoomScale);
  });

  it("tilts monotonically and zooms out as it goes", () => {
    expect(lerpView(0.5).phi).toBeGreaterThan(lerpView(0.25).phi);
    expect(lerpView(1).zoomScale).toBeLessThan(lerpView(0).zoomScale);
  });
});

describe("fitZoom", () => {
  it("fits the constraining axis", () => {
    // A wide, shallow grid in a square canvas is limited by width.
    const zoom = fitZoom(1000, 1000, 100, 10, 1);
    expect(zoom).toBeCloseTo(10);
  });

  it("applies padding", () => {
    expect(fitZoom(1000, 1000, 100, 10, 0.9)).toBeCloseTo(9);
  });

  it("degrades safely on empty or unmeasured input", () => {
    expect(fitZoom(1000, 1000, 0, 0)).toBe(1);
    expect(fitZoom(0, 0, 100, 10)).toBe(1);
  });
});

describe("projectFlat", () => {
  it("maps the origin to the canvas centre", () => {
    expect(projectFlat(0, 0, 800, 400, 10)).toEqual({ left: 400, top: 200 });
  });

  it("maps +X right and +Z down, matching the heatmap's axes", () => {
    const right = projectFlat(1, 0, 800, 400, 10);
    const down = projectFlat(0, 1, 800, 400, 10);
    expect(right.left).toBeGreaterThan(400);
    expect(right.top).toBe(200);
    expect(down.top).toBeGreaterThan(200);
    expect(down.left).toBe(400);
  });
});

describe("columnProgress", () => {
  it("is 0 for every column before the transform starts", () => {
    expect(columnProgress(0, 0, 53)).toBe(0);
    expect(columnProgress(0, 52, 53)).toBe(0);
  });

  it("reaches 1 for every column once the transform completes", () => {
    expect(columnProgress(1, 0, 53)).toBe(1);
    expect(columnProgress(1, 52, 53)).toBe(1);
  });

  it("runs earlier columns ahead of later ones mid-transform", () => {
    const early = columnProgress(0.5, 0, 53);
    const late = columnProgress(0.5, 52, 53);
    expect(early).toBeGreaterThan(late);
  });

  it("handles a single-column period without dividing by zero", () => {
    expect(columnProgress(0.5, 0, 1)).toBe(0.5);
    expect(columnProgress(0.5, 0, 0)).toBe(0.5);
  });

  it("is reversible — scrubbing back lowers every column", () => {
    expect(columnProgress(0.2, 10, 53)).toBeLessThan(
      columnProgress(0.8, 10, 53),
    );
  });
});
