import { describe, expect, it } from "vitest";
import {
  CITY_VIEW,
  FLAT_VIEW,
  columnProgress,
  easeInOutCubic,
  easeOutCubic,
  fitZoomForView,
  lerpView,
  projectFlat,
  projectedExtent,
  sphericalToCartesian,
  viewBasis,
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
  it("pins the endpoints", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("crosses the midpoint slightly high", () => {
    // cubic-bezier(.645,.045,.355,1) is symmetric in x but not in y: the
    // first control point sits at .045 while the second sits at 1, so the
    // curve is a shade past halfway at t=0.5 rather than exactly on it.
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.516875, 4);
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
  });

  it("tilts monotonically", () => {
    expect(lerpView(0.5).phi).toBeGreaterThan(lerpView(0.25).phi);
    expect(lerpView(0.75).phi).toBeGreaterThan(lerpView(0.5).phi);
  });
});

describe("lerpView with a custom tilted view", () => {
  it("ends at whatever tilted angle it is given", () => {
    const orbited = { phi: 1.1, theta: 2.4 };
    const end = lerpView(1, orbited);
    expect(end.phi).toBeCloseTo(orbited.phi);
    expect(end.theta).toBeCloseTo(orbited.theta);
  });

  it("still starts flat whatever the tilted end is", () => {
    expect(lerpView(0, { phi: 1.1, theta: 2.4 })).toEqual(FLAT_VIEW);
  });

  it("takes the short way around past half a turn", () => {
    // theta just under -PI should travel forward through -PI, not all the
    // way back around through 0.
    const mid = lerpView(0.5, { phi: 0.9, theta: -3.0 });
    expect(mid.theta).toBeLessThan(0);
  });
});

describe("viewBasis", () => {
  it("maps world +X to screen right and world +Z to screen down when flat", () => {
    const { right, up } = viewBasis(FLAT_VIEW);
    expect(right.x).toBeCloseTo(1, 2);
    // Screen-up points along -Z, so +Z is downward — matching the
    // heatmap, where later weekdays sit lower.
    expect(up.z).toBeCloseTo(-1, 1);
  });

  it("produces orthonormal axes", () => {
    for (const view of [FLAT_VIEW, CITY_VIEW, lerpView(0.5)]) {
      const { right, up } = viewBasis(view);
      expect(Math.hypot(right.x, right.y, right.z)).toBeCloseTo(1);
      expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1);
      expect(right.x * up.x + right.y * up.y + right.z * up.z).toBeCloseTo(0);
    }
  });
});

describe("projectedExtent", () => {
  it("matches the raw footprint when flat and flat-heighted", () => {
    const extent = projectedExtent(100, 10, 0, FLAT_VIEW);
    expect(extent.width).toBeCloseTo(100, 0);
    expect(extent.height).toBeCloseTo(10, 0);
  });

  it("narrows the projected width when the grid rotates", () => {
    const flat = projectedExtent(100, 10, 0, FLAT_VIEW);
    const tilted = projectedExtent(100, 10, 0, CITY_VIEW);
    // Rotating a long ribbon away from screen-parallel shortens it, which
    // is why a fixed zoom-out factor left the city too small.
    expect(tilted.width).toBeLessThan(flat.width);
  });

  it("grows vertically once buildings have height", () => {
    const flatBuildings = projectedExtent(100, 10, 0, CITY_VIEW);
    const tallBuildings = projectedExtent(100, 10, 6, CITY_VIEW);
    expect(tallBuildings.height).toBeGreaterThan(flatBuildings.height);
  });
});

describe("fitZoomForView", () => {
  it("fits the constraining axis", () => {
    const zoom = fitZoomForView(1000, 1000, 100, 10, 0, FLAT_VIEW, 1);
    expect(zoom).toBeCloseTo(10, 1);
  });

  it("applies padding", () => {
    expect(fitZoomForView(1000, 1000, 100, 10, 0, FLAT_VIEW, 0.9)).toBeCloseTo(
      9,
      1,
    );
  });

  it("keeps the city inside the canvas at both ends of the transform", () => {
    const canvasWidth = 900;
    const canvasHeight = 420;

    for (const [t, height] of [
      [0, 0],
      [0.5, 3],
      [1, 6],
    ] as const) {
      const view = lerpView(t);
      const zoom = fitZoomForView(
        canvasWidth,
        canvasHeight,
        65,
        8.4,
        height,
        view,
      );
      const extent = projectedExtent(65, 8.4, height, view);
      expect(extent.width * zoom).toBeLessThanOrEqual(canvasWidth + 0.001);
      expect(extent.height * zoom).toBeLessThanOrEqual(canvasHeight + 0.001);
    }
  });

  it("degrades safely on empty or unmeasured input", () => {
    expect(fitZoomForView(1000, 1000, 0, 0, 0, FLAT_VIEW)).toBe(1);
    expect(fitZoomForView(0, 0, 100, 10, 0, FLAT_VIEW)).toBe(1);
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

describe("easeOutCubic", () => {
  it("pins the endpoints", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("starts fast, unlike ease-in-out", () => {
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
    expect(easeOutCubic(0.25)).toBeGreaterThan(easeInOutCubic(0.25));
  });

  it("is monotonic", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easeOutCubic(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
