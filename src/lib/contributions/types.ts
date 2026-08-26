/**
 * Public API types — mirrors the contract in the project spec for
 * `GET /api/contributions?user={normalizedUsername}`. Keep this file in
 * sync with the spec; it's the shape both the API route and the frontend
 * import from.
 */

export type ContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export type ContributionDay = {
  date: string; // YYYY-MM-DD
  count: number;
  level: ContributionLevel;
  weekday: number; // 0 (Sunday) .. 6 (Saturday)
  weekIndex: number; // 0-based column index within the period's grid
};

export type PeriodId = "last-12-months" | `year-${number}`;

export type ContributionPeriod = {
  id: PeriodId;
  label: string;
  from: string; // ISO date
  to: string; // ISO date
  totalContributions: number;
  days: ContributionDay[];
};

export type GithubProfile = {
  login: string;
  name: string | null;
  avatarUrl: string;
  profileUrl: string;
};

export type ContributionResponse = {
  profile: GithubProfile;
  periods: ContributionPeriod[];
};

export const CONTRIBUTION_ERROR_CODES = [
  "INVALID_USERNAME",
  "NOT_FOUND",
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_ERROR",
] as const;

export type ContributionErrorCode = (typeof CONTRIBUTION_ERROR_CODES)[number];

export type ContributionErrorResponse = {
  error: {
    code: ContributionErrorCode;
    message: string;
    retryAfter?: number;
  };
};
