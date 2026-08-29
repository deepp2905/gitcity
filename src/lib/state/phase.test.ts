import { describe, expect, it } from "vitest";
import {
  LOADING_FLOOR_MAX_MS,
  LOADING_FLOOR_MIN_MS,
  isInteractive,
  pickLoadingFloorMs,
  resolvePhase,
  type PhaseInput,
} from "./phase";

const base: PhaseInput = {
  user: null,
  loadedLogin: null,
  minElapsed: false,
  hasError: false,
};

describe("resolvePhase", () => {
  it("is idle before anyone searches", () => {
    expect(resolvePhase(base)).toBe("idle");
  });

  it("loads as soon as there is a username", () => {
    expect(resolvePhase({ ...base, user: "torvalds" })).toBe("loading");
  });

  it("keeps loading until the minimum time has passed, even with data", () => {
    // The whole point of the gate: a fixture answers in ~20ms and the
    // wave would otherwise never be seen.
    expect(
      resolvePhase({ ...base, user: "torvalds", loadedLogin: "torvalds" }),
    ).toBe("loading");
  });

  it("keeps loading after the minimum time if the data hasn't arrived", () => {
    expect(resolvePhase({ ...base, user: "torvalds", minElapsed: true })).toBe(
      "loading",
    );
  });

  it("is ready once the data has arrived and the minimum has passed", () => {
    expect(
      resolvePhase({
        ...base,
        user: "torvalds",
        loadedLogin: "torvalds",
        minElapsed: true,
      }),
    ).toBe("ready");
  });

  it("stays loading while the held data belongs to someone else", () => {
    expect(
      resolvePhase({
        ...base,
        user: "deepp2905",
        loadedLogin: "torvalds",
        minElapsed: true,
      }),
    ).toBe("loading");
  });

  it("matches the username case-insensitively", () => {
    expect(
      resolvePhase({
        ...base,
        user: "TorValds",
        loadedLogin: "torvalds",
        minElapsed: true,
      }),
    ).toBe("ready");
  });

  it("returns to idle when a search fails, whatever was loaded before", () => {
    // Not "ready". The ready phase swaps the search field out for the
    // loaded user's controls, so resolving there would resurrect the
    // previous city, label it with someone else's error, and leave no
    // field to try again in.
    expect(
      resolvePhase({
        ...base,
        user: "nope",
        loadedLogin: "torvalds",
        hasError: true,
      }),
    ).toBe("idle");
  });

  it("falls back to the mock when the very first search fails", () => {
    expect(resolvePhase({ ...base, user: "nope", hasError: true })).toBe("idle");
  });
});

describe("isInteractive", () => {
  it("allows taps only once there is real data", () => {
    expect(isInteractive("idle")).toBe(false);
    expect(isInteractive("loading")).toBe(false);
    expect(isInteractive("ready")).toBe(true);
  });
});

describe("pickLoadingFloorMs", () => {
  it("spans the full range end to end", () => {
    expect(pickLoadingFloorMs(() => 0)).toBe(LOADING_FLOOR_MIN_MS);
    expect(pickLoadingFloorMs(() => 0.5)).toBe(2000);
    // Math.random never returns 1, so this is the open upper bound.
    expect(pickLoadingFloorMs(() => 1)).toBe(LOADING_FLOOR_MAX_MS);
  });

  it("stays inside the range for any draw", () => {
    for (let i = 0; i < 200; i++) {
      const floor = pickLoadingFloorMs();
      expect(floor).toBeGreaterThanOrEqual(LOADING_FLOOR_MIN_MS);
      expect(floor).toBeLessThanOrEqual(LOADING_FLOOR_MAX_MS);
    }
  });
});
