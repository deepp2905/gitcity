import { describe, expect, it } from "vitest";
import {
  SPRING_TIMESTEP_S,
  columnDelayMs,
  stepSpring,
  type SpringSettings,
} from "./spring";

/** Runs a spring from 0 toward 1 and reports what it did. */
function simulate(settings: SpringSettings, seconds = 4) {
  let value = 0;
  let velocity = 0;
  let peak = 0;
  let trough = Infinity;

  const steps = Math.round(seconds / SPRING_TIMESTEP_S);
  for (let i = 0; i < steps; i++) {
    ({ value, velocity } = stepSpring(value, velocity, 1, settings, SPRING_TIMESTEP_S));
    peak = Math.max(peak, value);
    trough = Math.min(trough, value);
  }

  return { value, velocity, peak, trough };
}

describe("stepSpring", () => {
  it("settles on the target", () => {
    const { value, velocity } = simulate({ stiffness: 190, dampingRatio: 0.7 });
    expect(value).toBeCloseTo(1, 3);
    expect(Math.abs(velocity)).toBeLessThan(0.01);
  });

  it("does not overshoot when critically damped", () => {
    const { peak } = simulate({ stiffness: 190, dampingRatio: 1 });
    expect(peak).toBeLessThanOrEqual(1.0005);
  });

  it("overshoots when underdamped, and more as the ratio drops", () => {
    const gentle = simulate({ stiffness: 190, dampingRatio: 0.7 });
    const bouncy = simulate({ stiffness: 190, dampingRatio: 0.4 });

    expect(gentle.peak).toBeGreaterThan(1);
    expect(bouncy.peak).toBeGreaterThan(gentle.peak);
  });

  it("keeps the default overshoot subtle", () => {
    // ~5% pop: visible character without looking like a toy.
    const { peak } = simulate({ stiffness: 190, dampingRatio: 0.7 });
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.12);
  });

  it("never dips below its starting point on the way up", () => {
    const { trough } = simulate({ stiffness: 190, dampingRatio: 0.7 });
    expect(trough).toBeGreaterThanOrEqual(0);
  });

  it("reaches the target faster at higher stiffness", () => {
    const settle = (stiffness: number) => {
      let value = 0;
      let velocity = 0;
      for (let i = 0; i < 2000; i++) {
        ({ value, velocity } = stepSpring(
          value,
          velocity,
          1,
          { stiffness, dampingRatio: 1 },
          SPRING_TIMESTEP_S,
        ));
        if (value > 0.9) return i;
      }
      return Infinity;
    };

    expect(settle(400)).toBeLessThan(settle(100));
  });

  it("stays finite at the fixed timestep even when very stiff", () => {
    const { value, velocity } = simulate({ stiffness: 600, dampingRatio: 0.2 });
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(velocity)).toBe(true);
  });
});

describe("columnDelayMs", () => {
  it("starts the first column immediately and the last at the full sweep", () => {
    expect(columnDelayMs(0, 53, 420, 1)).toBe(0);
    expect(columnDelayMs(52, 53, 420, 1)).toBeCloseTo(420);
  });

  it("is linear at curve 1", () => {
    expect(columnDelayMs(26, 53, 400, 1)).toBeCloseTo(200, 0);
  });

  it("holds early columns back above curve 1", () => {
    expect(columnDelayMs(26, 53, 400, 2)).toBeLessThan(
      columnDelayMs(26, 53, 400, 1),
    );
  });

  it("front-loads the wave below curve 1", () => {
    expect(columnDelayMs(26, 53, 400, 0.5)).toBeGreaterThan(
      columnDelayMs(26, 53, 400, 1),
    );
  });

  it("never exceeds the total sweep, whatever the curve", () => {
    for (const curve of [0.3, 1, 3]) {
      for (let i = 0; i < 53; i++) {
        expect(columnDelayMs(i, 53, 420, curve)).toBeLessThanOrEqual(420.0001);
      }
    }
  });

  it("handles a single column without dividing by zero", () => {
    expect(columnDelayMs(0, 1, 420, 1)).toBe(0);
    expect(columnDelayMs(0, 0, 420, 1)).toBe(0);
  });
});
