import type { ContributionErrorCode } from "@/lib/contributions/types";

/** Typed error the GitHub client throws — the API route maps this
 * directly to the stable `{ error: { code, message, retryAfter } }`
 * response shape, without leaking upstream details to the client. */
export class GithubApiError extends Error {
  readonly code: ContributionErrorCode;
  readonly retryAfter?: number;

  constructor(code: ContributionErrorCode, message: string, retryAfter?: number) {
    super(message);
    this.name = "GithubApiError";
    this.code = code;
    this.retryAfter = retryAfter;
  }
}
