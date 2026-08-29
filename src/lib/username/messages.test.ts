import { describe, expect, it } from "vitest";
import { USERNAME_ERROR_MESSAGES } from "./messages";

/**
 * The error slot above the search field is one line of `text-sm` inside a
 * `max-w-md` box, less its padding: roughly 63 characters. A longer
 * message wraps, and since the slot reserves no height, wrapping pushes
 * the field and the city up.
 */
const LINE_BUDGET = 63;

describe("USERNAME_ERROR_MESSAGES", () => {
  const entries = Object.entries(USERNAME_ERROR_MESSAGES);

  it("fits every message on one line", () => {
    for (const [reason, message] of entries) {
      expect(
        message.length,
        `${reason}: ${message.length} chars`,
      ).toBeLessThanOrEqual(LINE_BUDGET);
    }
  });

  it("uses no em dashes", () => {
    for (const [reason, message] of entries) {
      expect(message, reason).not.toContain("\u2014");
    }
  });

  it("says something for every way parsing can fail", () => {
    for (const [reason, message] of entries) {
      expect(message.trim(), reason).not.toBe("");
    }
    expect(entries.length).toBeGreaterThanOrEqual(4);
  });
});
