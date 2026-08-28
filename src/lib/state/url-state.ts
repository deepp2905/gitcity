import type { PeriodId } from "@/lib/contributions/types";

export const DEFAULT_PERIOD_ID: PeriodId = "last-12-months";

/**
 * What the URL carries: who the city belongs to, and which period of
 * theirs is on screen. Both are worth linking to.
 *
 * The 2D/3D view is deliberately not here — see src/lib/state/view.ts.
 */
export type AppUrlState = {
  user: string | null;
  period: PeriodId;
};

const PERIOD_PATTERN = /^year-\d{4}$/;

export function parsePeriodParam(raw: string | null): PeriodId {
  if (!raw) return DEFAULT_PERIOD_ID;
  if (raw === "last-12-months") return raw;
  return PERIOD_PATTERN.test(raw) ? (raw as PeriodId) : DEFAULT_PERIOD_ID;
}

export function readUrlState(params: URLSearchParams): AppUrlState {
  return {
    user: params.get("user"),
    period: parsePeriodParam(params.get("period")),
  };
}

/**
 * Builds the query string for a given app state, omitting defaults so
 * shared links stay short and a plain `/?user=x` is the canonical form
 * for "this user, last 12 months".
 */
export function buildUrlQuery(state: AppUrlState): string {
  const params = new URLSearchParams();
  if (state.user) params.set("user", state.user);
  if (state.period !== DEFAULT_PERIOD_ID) params.set("period", state.period);

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
