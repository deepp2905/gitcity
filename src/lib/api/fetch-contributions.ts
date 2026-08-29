import type {
  ContributionErrorCode,
  ContributionErrorResponse,
  ContributionResponse,
} from "@/lib/contributions/types";

export type FetchContributionsResult =
  | { ok: true; data: ContributionResponse }
  | {
      ok: false;
      code: ContributionErrorCode;
      message: string;
      retryAfter?: number;
    };

function failure(
  code: ContributionErrorCode,
  message: string,
  retryAfter?: number,
): FetchContributionsResult {
  return { ok: false, code, message, retryAfter };
}

/**
 * Client-side wrapper around GET /api/contributions.
 *
 * Never throws for expected failures — every outcome comes back as a
 * typed result so callers can render an inline, actionable message while
 * keeping any previously loaded graph on screen. An `AbortError` from a
 * superseded request is the one case that does throw, so callers can
 * distinguish "cancelled" from "failed".
 */
export async function fetchContributions(
  user: string,
  signal?: AbortSignal,
): Promise<FetchContributionsResult> {
  let response: Response;
  try {
    response = await fetch(
      `/api/contributions?user=${encodeURIComponent(user)}`,
      { signal },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return failure(
      "UPSTREAM_ERROR",
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure("UPSTREAM_ERROR", "The server returned an unexpected response.");
  }

  if (!response.ok) {
    const errorBody = body as Partial<ContributionErrorResponse>;
    const error = errorBody?.error;
    return failure(
      error?.code ?? "UPSTREAM_ERROR",
      error?.message ?? "Something went wrong. Try again.",
      error?.retryAfter,
    );
  }

  return { ok: true, data: body as ContributionResponse };
}
