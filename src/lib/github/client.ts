import "server-only";
import { GithubApiError } from "./errors";
import { CONTRIBUTIONS_QUERY, type ContributionsQueryVariables } from "./query";
import type { RawContributionsQueryResult, RawUser } from "./raw-types";

const GITHUB_GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const DEFAULT_TIMEOUT_MS = 8000;

function getGithubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    // Server misconfiguration, not a user-facing problem — mapped to a
    // generic upstream error rather than exposing "token missing".
    throw new GithubApiError(
      "UPSTREAM_ERROR",
      "GITHUB_TOKEN is not configured on the server.",
    );
  }
  return token;
}

function getTimeoutMs(): number {
  const raw = process.env.GITHUB_API_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function secondsUntil(unixSeconds: number): number {
  return Math.max(0, Math.round(unixSeconds - Date.now() / 1000));
}

/** Maps a non-2xx HTTP response into a typed GithubApiError. */
function mapHttpError(response: Response): GithubApiError {
  if (response.status === 403 || response.status === 429) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const reset = response.headers.get("x-ratelimit-reset");
    const retryAfterHeader = response.headers.get("retry-after");

    const retryAfter = retryAfterHeader
      ? Number(retryAfterHeader)
      : reset
        ? secondsUntil(Number(reset))
        : undefined;

    if (remaining === "0" || response.status === 429 || retryAfterHeader) {
      return new GithubApiError(
        "RATE_LIMITED",
        "GitHub API rate limit exceeded.",
        retryAfter,
      );
    }
  }

  if (response.status === 401) {
    return new GithubApiError(
      "UPSTREAM_ERROR",
      "GitHub API rejected the configured token.",
    );
  }

  return new GithubApiError(
    "UPSTREAM_ERROR",
    `GitHub API responded with HTTP ${response.status}.`,
  );
}

/** Maps GraphQL-level `errors` (HTTP 200 but query-level failure) into a
 * typed GithubApiError. */
function mapGraphQLErrors(
  errors: NonNullable<RawContributionsQueryResult["errors"]>,
): GithubApiError {
  const notFound = errors.find((e) => e.type === "NOT_FOUND");
  if (notFound) {
    return new GithubApiError("NOT_FOUND", "GitHub user not found.");
  }

  const rateLimited = errors.find(
    (e) => e.type === "RATE_LIMITED" || /rate limit/i.test(e.message),
  );
  if (rateLimited) {
    return new GithubApiError("RATE_LIMITED", "GitHub API rate limit exceeded.");
  }

  return new GithubApiError(
    "UPSTREAM_ERROR",
    errors[0]?.message ?? "GitHub API returned an error.",
  );
}

/**
 * Executes the contribution calendars query for `login` against GitHub's
 * GraphQL API. Throws `GithubApiError` for every failure mode (timeout,
 * rate limit, not found, generic upstream error) — callers don't need to
 * inspect HTTP status codes themselves.
 */
export async function fetchContributionCalendars(
  login: string,
  variables: Omit<ContributionsQueryVariables, "login">,
): Promise<RawUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getGithubToken()}`,
        "Content-Type": "application/json",
        "User-Agent": "contribution-city",
      },
      body: JSON.stringify({
        query: CONTRIBUTIONS_QUERY,
        variables: { login, ...variables },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GithubApiError(
        "UPSTREAM_TIMEOUT",
        "Timed out waiting for GitHub's API.",
      );
    }
    throw new GithubApiError(
      "UPSTREAM_ERROR",
      "Could not reach GitHub's API.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw mapHttpError(response);
  }

  let body: RawContributionsQueryResult;
  try {
    body = (await response.json()) as RawContributionsQueryResult;
  } catch {
    throw new GithubApiError(
      "UPSTREAM_ERROR",
      "GitHub API returned a malformed response.",
    );
  }

  if (body.errors && body.errors.length > 0 && !body.data?.user) {
    throw mapGraphQLErrors(body.errors);
  }

  const user = body.data?.user;
  if (!user) {
    throw new GithubApiError("NOT_FOUND", "GitHub user not found.");
  }

  return user;
}
