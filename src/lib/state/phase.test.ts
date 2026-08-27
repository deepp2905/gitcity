import { describe, expect, it } from "vitest";
import { isInteractive, resolvePhase, type PhaseInput } from "./phase";

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

  it("keeps the existing city up when a later search fails", () => {
    expect(
      resolvePhase({
        ...base,
        user: "nope",
        loadedLogin: "torvalds",
        hasError: true,
      }),
    ).toBe("ready");
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
