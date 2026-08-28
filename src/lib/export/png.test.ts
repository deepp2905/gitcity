import { describe, expect, it } from "vitest";
import {
  EXPORT_LOGICAL_HEIGHT,
  EXPORT_LOGICAL_WIDTH,
  EXPORT_PIXEL_RATIO,
  exportFilename,
} from "./png";

describe("export frame", () => {
  it("is 3:5 portrait", () => {
    expect(EXPORT_LOGICAL_WIDTH / EXPORT_LOGICAL_HEIGHT).toBeCloseTo(3 / 5);
    expect(EXPORT_LOGICAL_HEIGHT).toBeGreaterThan(EXPORT_LOGICAL_WIDTH);
  });

  it("renders at 2x, giving whole pixels", () => {
    expect(EXPORT_PIXEL_RATIO).toBe(2);
    expect(EXPORT_LOGICAL_WIDTH * EXPORT_PIXEL_RATIO).toBe(1080);
    expect(EXPORT_LOGICAL_HEIGHT * EXPORT_PIXEL_RATIO).toBe(1800);
  });
});

describe("exportFilename", () => {
  it("names the file after the login and period", () => {
    expect(exportFilename("torvalds", "2024")).toBe("gitcity-torvalds-2024.png");
  });

  it("slugs a period label with spaces", () => {
    expect(exportFilename("octocat", "Last 12 months")).toBe(
      "gitcity-octocat-last-12-months.png",
    );
  });

  it("strips characters a filesystem would object to", () => {
    expect(exportFilename("oct/cat", "2024 — best?")).toBe(
      "gitcity-oct-cat-2024-best.png",
    );
  });

  it("never trails a separator when a part slugs away to nothing", () => {
    expect(exportFilename("octocat", "???")).toBe("gitcity-octocat.png");
    expect(exportFilename("", "")).toBe("gitcity-city.png");
  });
});
