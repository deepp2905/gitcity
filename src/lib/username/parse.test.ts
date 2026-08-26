import { describe, expect, it } from "vitest";
import { parseUsernameInput } from "./parse";

describe("parseUsernameInput", () => {
  it("accepts a plain username", () => {
    expect(parseUsernameInput("octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts a plain username with hyphens and digits", () => {
    expect(parseUsernameInput("torvalds-2")).toEqual({
      ok: true,
      username: "torvalds-2",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseUsernameInput("  octocat  ")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("normalizes casing to lowercase", () => {
    expect(parseUsernameInput("OctoCat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts an @-prefixed username", () => {
    expect(parseUsernameInput("@octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("rejects a bare @ with nothing after it", () => {
    expect(parseUsernameInput("@")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
  });

  it("accepts an https profile URL", () => {
    expect(parseUsernameInput("https://github.com/octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts an http profile URL", () => {
    expect(parseUsernameInput("http://github.com/octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts a www. profile URL", () => {
    expect(parseUsernameInput("https://www.github.com/octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts a protocol-less github.com URL", () => {
    expect(parseUsernameInput("github.com/octocat")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("accepts a profile URL with a trailing slash", () => {
    expect(parseUsernameInput("https://github.com/octocat/")).toEqual({
      ok: true,
      username: "octocat",
    });
  });

  it("extracts the username from a repository URL", () => {
    expect(
      parseUsernameInput("https://github.com/octocat/Hello-World"),
    ).toEqual({ ok: true, username: "octocat" });
  });

  it("extracts the username from a deep repository URL with query/hash", () => {
    expect(
      parseUsernameInput(
        "https://github.com/octocat/Hello-World/issues/42?tab=open#comment",
      ),
    ).toEqual({ ok: true, username: "octocat" });
  });

  it("rejects a non-GitHub host", () => {
    expect(parseUsernameInput("https://gitlab.com/octocat")).toEqual({
      ok: false,
      reason: "invalid-host",
    });
  });

  it("rejects a malformed/lookalike host", () => {
    expect(parseUsernameInput("https://github.com.evil.com/octocat")).toEqual(
      { ok: false, reason: "invalid-host" },
    );
  });

  it("rejects a non-http(s) protocol", () => {
    expect(parseUsernameInput("ftp://github.com/octocat")).toEqual({
      ok: false,
      reason: "invalid-host",
    });
  });

  it("rejects a profile URL with no path segment", () => {
    expect(parseUsernameInput("https://github.com")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
    expect(parseUsernameInput("https://github.com/")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
  });

  it("rejects reserved GitHub top-level paths", () => {
    expect(parseUsernameInput("settings")).toEqual({
      ok: false,
      reason: "reserved",
    });
    expect(parseUsernameInput("https://github.com/marketplace")).toEqual({
      ok: false,
      reason: "reserved",
    });
  });

  it("rejects usernames with invalid syntax", () => {
    expect(parseUsernameInput("-octocat")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
    expect(parseUsernameInput("octocat-")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
    expect(parseUsernameInput("octo--cat")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
    expect(parseUsernameInput("octo_cat")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
    expect(parseUsernameInput("a".repeat(40))).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
  });

  it("rejects empty input", () => {
    expect(parseUsernameInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseUsernameInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects input containing whitespace", () => {
    expect(parseUsernameInput("octo cat")).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
  });
});
