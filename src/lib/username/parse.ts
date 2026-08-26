import { isReservedGithubUsername } from "./reserved";

/**
 * GitHub username syntax: alphanumeric characters or single hyphens, may
 * not start or end with a hyphen, no consecutive hyphens, max 39 chars.
 */
const GITHUB_USERNAME_PATTERN =
  /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;

export type UsernameParseFailureReason =
  | "empty"
  | "invalid-syntax"
  | "invalid-host"
  | "reserved";

export type UsernameParseResult =
  | { ok: true; username: string }
  | { ok: false; reason: UsernameParseFailureReason };

function fail(reason: UsernameParseFailureReason): UsernameParseResult {
  return { ok: false, reason };
}

function isSyntacticallyValid(candidate: string): boolean {
  return GITHUB_USERNAME_PATTERN.test(candidate);
}

function finalize(candidate: string): UsernameParseResult {
  if (!isSyntacticallyValid(candidate)) return fail("invalid-syntax");
  if (isReservedGithubUsername(candidate)) return fail("reserved");
  // GitHub logins are case-insensitive; normalize to lowercase so the same
  // person always maps to one cache entry / URL value.
  return { ok: true, username: candidate.toLowerCase() };
}

function looksLikeUrlInput(raw: string): boolean {
  return (
    raw.includes("://") ||
    raw.startsWith("www.") ||
    /^[^\s/@]+\.[a-z]{2,}(\/|$)/i.test(raw)
  );
}

function parseAsUrl(raw: string): UsernameParseResult {
  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return fail("invalid-syntax");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("invalid-host");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (hostname !== "github.com") {
    return fail("invalid-host");
  }

  const [firstSegment] = url.pathname.split("/").filter(Boolean);
  if (!firstSegment) {
    return fail("invalid-syntax");
  }

  return finalize(decodeURIComponent(firstSegment));
}

/**
 * Parses free-form user input (a bare username, an `@username`, a GitHub
 * profile URL, or a GitHub repository URL) into a normalized GitHub
 * username, or a typed failure reason.
 *
 * Non-GitHub URLs and syntactically/reserved-invalid usernames are
 * rejected rather than guessed at.
 */
export function parseUsernameInput(raw: string): UsernameParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return fail("empty");

  if (trimmed.startsWith("@")) {
    const candidate = trimmed.slice(1);
    if (!candidate || candidate.includes("/") || /\s/.test(candidate)) {
      return fail("invalid-syntax");
    }
    return finalize(candidate);
  }

  if (looksLikeUrlInput(trimmed)) {
    return parseAsUrl(trimmed);
  }

  if (/\s/.test(trimmed) || trimmed.includes("/")) {
    return fail("invalid-syntax");
  }

  return finalize(trimmed);
}
