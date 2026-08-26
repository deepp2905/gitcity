import type { PeriodId } from "@/lib/contributions/types";

export type ViewMode = "2d" | "3d";

export const DEFAULT_PERIOD_ID: PeriodId = "last-12-months";
export const DEFAULT_VIEW: ViewMode = "2d";

export type AppUrlState = {
  user: string | null;
  period: PeriodId;
  view: ViewMode;
};

const PERIOD_PATTERN = /^year-\d{4}$/;

export function parsePeriodParam(raw: string | null): PeriodId {
  if (!raw) return DEFAULT_PERIOD_ID;
  if (raw === "last-12-months") return raw;
  return PERIOD_PATTERN.test(raw) ? (raw as PeriodId) : DEFAULT_PERIOD_ID;
}

export function parseViewParam(raw: string | null): ViewMode {
  return raw === "3d" ? "3d" : DEFAULT_VIEW;
}

export function readUrlState(params: URLSearchParams): AppUrlState {
  return {
    user: params.get("user"),
    period: parsePeriodParam(params.get("period")),
    view: parseViewParam(params.get("view")),
  };
}

/**
 * Builds the query string for a given app state, omitting defaults so
 * shared links stay short and a plain `/?user=x` is the canonical form
 * for "this user, 2D, last 12 months".
 */
export function buildUrlQuery(state: AppUrlState): string {
  const params = new URLSearchParams();
  if (state.user) params.set("user", state.user);
  if (state.period !== DEFAULT_PERIOD_ID) params.set("period", state.period);
  if (state.view !== DEFAULT_VIEW) params.set("view", state.view);

  const query = params.toString();
  return query ? `/?${query}` : "/";
}
