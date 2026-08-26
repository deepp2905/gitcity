import { describe, expect, it } from "vitest";
import { emptyPeriodMessage } from "./empty-message";

describe("emptyPeriodMessage", () => {
  it("is stable for a given period", () => {
    expect(emptyPeriodMessage("year-2025")).toEqual(
      emptyPeriodMessage("year-2025"),
    );
  });

  it("always returns non-empty copy", () => {
    for (const id of ["year-2020", "year-2025", "last-12-months", ""]) {
      const message = emptyPeriodMessage(id);
      expect(message.headline.length).toBeGreaterThan(0);
      expect(message.detail.length).toBeGreaterThan(0);
    }
  });

  it("varies across periods rather than always picking one message", () => {
    const headlines = new Set(
      ["year-2021", "year-2022", "year-2023", "year-2024", "year-2025"].map(
        (id) => emptyPeriodMessage(id).headline,
      ),
    );
    expect(headlines.size).toBeGreaterThan(1);
  });
});
