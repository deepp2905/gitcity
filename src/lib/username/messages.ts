import type { UsernameParseFailureReason } from "./parse";

/**
 * What to say when a username won't parse.
 *
 * One copy, shared by the client-side check in SearchForm and the
 * server-side one in the API route. Both run the same parser, so the two
 * used to hold identical strings in two files — a duplication that costs
 * nothing until someone edits one of them.
 *
 * Kept short enough to sit on a single line in the error slot above the
 * field, which is about 63 characters at its width.
 */
export const USERNAME_ERROR_MESSAGES: Record<
  UsernameParseFailureReason,
  string
> = {
  empty: "Enter a GitHub username or URL.",
  "invalid-syntax": "That isn't a valid GitHub username or URL.",
  // Only ever reached by a URL pointing somewhere other than github.com;
  // a bare username cannot fail this way.
  "invalid-host": "Only github.com URLs are supported.",
  reserved: "That username is reserved by GitHub.",
};
