import { describe, expect, it } from "vitest";
import { buildUrlQuery, parsePeriodParam, readUrlState } from "./url-state";

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

describe("readUrlState", () => {
  it("reads both params", () => {
    const params = new URLSearchParams("user=octocat&period=year-2024");
    expect(readUrlState(params)).toEqual({
      user: "octocat",
      period: "year-2024",
    });
  });

  it("supplies defaults for missing params", () => {
    expect(readUrlState(new URLSearchParams(""))).toEqual({
      user: null,
      period: "last-12-months",
    });
  });

  it("ignores a view param left over from an older link", () => {
    const params = new URLSearchParams("user=octocat&view=3d");
    expect(readUrlState(params)).toEqual({
      user: "octocat",
      period: "last-12-months",
    });
  });
});

describe("buildUrlQuery", () => {
  it("omits the default period", () => {
    expect(buildUrlQuery({ user: "octocat", period: "last-12-months" })).toBe(
      "/?user=octocat",
    );
  });

  it("includes a non-default period", () => {
    expect(buildUrlQuery({ user: "octocat", period: "year-2024" })).toBe(
      "/?user=octocat&period=year-2024",
    );
  });

  it("never writes a view param", () => {
    expect(buildUrlQuery({ user: "octocat", period: "year-2024" })).not.toContain(
      "view",
    );
  });

  it("returns the bare root when there is no user", () => {
    expect(buildUrlQuery({ user: null, period: "last-12-months" })).toBe("/");
  });

  it("round-trips through readUrlState", () => {
    const state = { user: "octocat", period: "year-2023" as const };
    const query = buildUrlQuery(state);
    expect(readUrlState(new URLSearchParams(query.split("?")[1]))).toEqual(state);
  });
});
