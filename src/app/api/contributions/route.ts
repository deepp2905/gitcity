import { NextResponse } from "next/server";
import type {
  ContributionErrorCode,
  ContributionErrorResponse,
  ContributionResponse,
} from "@/lib/contributions/types";
import { parseUsernameInput } from "@/lib/username/parse";
import { USERNAME_ERROR_MESSAGES } from "@/lib/username/messages";
import { fetchContributionCalendars } from "@/lib/github/client";
import { computeStaticBoundaries, toQueryVariables } from "@/lib/github/boundaries";
import { normalizeContributionsResponse } from "@/lib/github/normalize";
import { GithubApiError } from "@/lib/github/errors";
import {
  cacheNotFound,
  cacheSuccess,
  getCachedSuccess,
  isCachedNotFound,
} from "@/lib/github/cache";
import { checkThrottle } from "@/lib/github/throttle";
import { fixturesEnabled, readFixture } from "@/lib/github/fixtures";

export const runtime = "nodejs";

const STATUS_BY_CODE: Record<ContributionErrorCode, number> = {
  INVALID_USERNAME: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
};


function errorResponse(
  code: ContributionErrorCode,
  message: string,
  retryAfter?: number,
): NextResponse<ContributionErrorResponse> {
  const body: ContributionErrorResponse = {
    error: { code, message, ...(retryAfter !== undefined ? { retryAfter } : {}) },
  };
  const response = NextResponse.json(body, { status: STATUS_BY_CODE[code] });
  if (retryAfter !== undefined) {
    response.headers.set("Retry-After", String(retryAfter));
  }
  return response;
}

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function GET(request: Request): Promise<NextResponse> {
  const throttle = checkThrottle(getClientKey(request));
  if (!throttle.allowed) {
    return errorResponse(
      "RATE_LIMITED",
      "Too many requests. Wait a moment.",
      throttle.retryAfter,
    );
  }

  const rawUser = new URL(request.url).searchParams.get("user") ?? "";
  const parsed = parseUsernameInput(rawUser);
  if (!parsed.ok) {
    return errorResponse("INVALID_USERNAME", USERNAME_ERROR_MESSAGES[parsed.reason]);
  }
  const username = parsed.username;

  // Offline development: serve a saved response and skip GitHub entirely.
  if (fixturesEnabled()) {
    const fixture = await readFixture(username);
    if (fixture) return NextResponse.json<ContributionResponse>(fixture);
    return errorResponse(
      "NOT_FOUND",
      `No fixture saved for "${username}". Add fixtures/${username}.json or unset USE_FIXTURES.`,
    );
  }

  const cachedSuccess = getCachedSuccess(username);
  if (cachedSuccess) {
    return NextResponse.json<ContributionResponse>(cachedSuccess);
  }
  if (isCachedNotFound(username)) {
    return errorResponse("NOT_FOUND", `No GitHub user "${username}".`);
  }

  const now = new Date();
  try {
    const rawUserData = await fetchContributionCalendars(
      username,
      toQueryVariables(computeStaticBoundaries(now)),
    );
    const normalized = normalizeContributionsResponse(rawUserData, now);
    cacheSuccess(username, normalized);
    return NextResponse.json<ContributionResponse>(normalized);
  } catch (err) {
    if (err instanceof GithubApiError) {
      if (err.code === "NOT_FOUND") {
        cacheNotFound(username);
        return errorResponse(
          "NOT_FOUND",
          `No GitHub user "${username}".`,
        );
      }
      return errorResponse(err.code, safeMessage(err), err.retryAfter);
    }

    console.error("Unexpected error fetching contributions:", err);
    return errorResponse("UPSTREAM_ERROR", "Something went wrong with GitHub. Try again.");
  }
}

/** User-facing message for known GithubApiError codes — never echoes raw
 * upstream error text for codes that could otherwise leak internals. */
function safeMessage(err: GithubApiError): string {
  switch (err.code) {
    case "RATE_LIMITED":
      return "Hit GitHub's rate limit. Try again shortly.";
    case "UPSTREAM_TIMEOUT":
      return "GitHub took too long to respond. Try again.";
    case "UPSTREAM_ERROR":
      return "Something went wrong with GitHub. Try again.";
    default:
      return err.message;
  }
}
