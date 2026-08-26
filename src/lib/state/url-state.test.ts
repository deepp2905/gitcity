import { describe, expect, it } from "vitest";
import {
  buildUrlQuery,
  parsePeriodParam,
  parseViewParam,
  readUrlState,
} from "./url-state";

describe("parsePeriodParam", () => {
  it("defaults to the rolling period when absent", () => {
    expect(parsePeriodParam(null)).toBe("last-12-months");
  });

  it("accepts the rolling period and well-formed year ids", () => {
    expect(parsePeriodParam("last-12-months")).toBe("last-12-months");
    expect(parsePeriodParam("year-2024")).toBe("year-2024");
  });

  it("falls back to the default for malformed values", () => {
    expect(parsePeriodParam("year-24")).toBe("last-12-months");
    expect(parsePeriodParam("nonsense")).toBe("last-12-months");
    expect(parsePeriodParam("")).toBe("last-12-months");
  });
});

describe("parseViewParam", () => {
  it("returns 3d only for an exact match", () => {
    expect(parseViewParam("3d")).toBe("3d");
    expect(parseViewParam("2d")).toBe("2d");
    expect(parseViewParam("3D")).toBe("2d");
    expect(parseViewParam(null)).toBe("2d");
  });
});

describe("readUrlState", () => {
  it("reads all three params", () => {
    const params = new URLSearchParams("user=octocat&period=year-2024&view=3d");
    expect(readUrlState(params)).toEqual({
      user: "octocat",
      period: "year-2024",
      view: "3d",
    });
  });

  it("supplies defaults for missing params", () => {
    expect(readUrlState(new URLSearchParams(""))).toEqual({
      user: null,
      period: "last-12-months",
      view: "2d",
    });
  });
});

describe("buildUrlQuery", () => {
  it("omits default period and view", () => {
    expect(
      buildUrlQuery({ user: "octocat", period: "last-12-months", view: "2d" }),
    ).toBe("/?user=octocat");
  });

  it("includes non-default period and view", () => {
    expect(
      buildUrlQuery({ user: "octocat", period: "year-2024", view: "3d" }),
    ).toBe("/?user=octocat&period=year-2024&view=3d");
  });

  it("returns the bare root when there is no user", () => {
    expect(
      buildUrlQuery({ user: null, period: "last-12-months", view: "2d" }),
    ).toBe("/");
  });

  it("round-trips through readUrlState", () => {
    const state = {
      user: "octocat",
      period: "year-2023" as const,
      view: "3d" as const,
    };
    const query = buildUrlQuery(state);
    expect(readUrlState(new URLSearchParams(query.split("?")[1]))).toEqual(state);
  });
});
