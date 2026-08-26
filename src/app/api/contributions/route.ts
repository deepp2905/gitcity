import { NextResponse } from "next/server";
import type {
  ContributionErrorCode,
  ContributionErrorResponse,
  ContributionResponse,
} from "@/lib/contributions/types";
import {
  parseUsernameInput,
  type UsernameParseFailureReason,
} from "@/lib/username/parse";
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

export const runtime = "nodejs";

const STATUS_BY_CODE: Record<ContributionErrorCode, number> = {
  INVALID_USERNAME: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_ERROR: 502,
};

const INVALID_USERNAME_MESSAGES: Record<UsernameParseFailureReason, string> = {
  empty: "Enter a GitHub username or profile URL.",
  "invalid-syntax": "That doesn't look like a valid GitHub username or URL.",
  "invalid-host": "Only github.com usernames and URLs are supported.",
  reserved: "That username is reserved by GitHub and can't belong to a user.",
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
      "Too many requests — please slow down.",
      throttle.retryAfter,
    );
  }

  const rawUser = new URL(request.url).searchParams.get("user") ?? "";
  const parsed = parseUsernameInput(rawUser);
  if (!parsed.ok) {
    return errorResponse("INVALID_USERNAME", INVALID_USERNAME_MESSAGES[parsed.reason]);
  }
  const username = parsed.username;

  const cachedSuccess = getCachedSuccess(username);
  if (cachedSuccess) {
    return NextResponse.json<ContributionResponse>(cachedSuccess);
  }
  if (isCachedNotFound(username)) {
    return errorResponse("NOT_FOUND", `No GitHub profile found for "${username}".`);
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
          `No GitHub profile found for "${username}".`,
        );
      }
      return errorResponse(err.code, safeMessage(err), err.retryAfter);
    }

    console.error("Unexpected error fetching contributions:", err);
    return errorResponse("UPSTREAM_ERROR", "Something went wrong talking to GitHub.");
  }
}

/** User-facing message for known GithubApiError codes — never echoes raw
 * upstream error text for codes that could otherwise leak internals. */
function safeMessage(err: GithubApiError): string {
  switch (err.code) {
    case "RATE_LIMITED":
      return "GitHub API rate limit reached — please try again shortly.";
    case "UPSTREAM_TIMEOUT":
      return "GitHub took too long to respond — please try again.";
    case "UPSTREAM_ERROR":
      return "Something went wrong talking to GitHub.";
    default:
      return err.message;
  }
}
