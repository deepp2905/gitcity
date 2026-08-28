import { describe, expect, it } from "vitest";
import { exportFilename } from "./png";

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
