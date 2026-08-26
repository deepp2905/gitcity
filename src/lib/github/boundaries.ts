import {
  completedCalendarYearRange,
  currentCalendarYearRange,
  rollingLast12MonthsFrom,
  staticCandidateYears,
} from "@/lib/contributions/periods";
import type { ContributionsQueryVariables } from "./query";

export type DateRange = { from: Date; to: Date };

export type StaticBoundaries = {
  /** [currentYear, currentYear-1, currentYear-2, currentYear-3] — aligned
   * positionally with query.ts's YEAR_ALIASES. */
  candidateYears: [number, number, number, number];
  last12: DateRange;
  currentYear: DateRange;
  yearMinus1: DateRange;
  yearMinus2: DateRange;
  yearMinus3: DateRange;
};

/** Computes the same date boundaries once used to build the GraphQL
 * request variables and again afterwards to label each period's from/to
 * in the normalized response — one pure, deterministic source for both. */
export function computeStaticBoundaries(now: Date): StaticBoundaries {
  const [currentYear, yearMinus1, yearMinus2, yearMinus3] =
    staticCandidateYears(now);

  return {
    candidateYears: [currentYear, yearMinus1, yearMinus2, yearMinus3],
    last12: { from: rollingLast12MonthsFrom(now), to: now },
    currentYear: currentCalendarYearRange(now),
    yearMinus1: completedCalendarYearRange(yearMinus1),
    yearMinus2: completedCalendarYearRange(yearMinus2),
    yearMinus3: completedCalendarYearRange(yearMinus3),
  };
}

export function toQueryVariables(
  boundaries: StaticBoundaries,
): Omit<ContributionsQueryVariables, "login"> {
  return {
    last12From: boundaries.last12.from.toISOString(),
    last12To: boundaries.last12.to.toISOString(),
    currentYearFrom: boundaries.currentYear.from.toISOString(),
    currentYearTo: boundaries.currentYear.to.toISOString(),
    yearMinus1From: boundaries.yearMinus1.from.toISOString(),
    yearMinus1To: boundaries.yearMinus1.to.toISOString(),
    yearMinus2From: boundaries.yearMinus2.from.toISOString(),
    yearMinus2To: boundaries.yearMinus2.to.toISOString(),
    yearMinus3From: boundaries.yearMinus3.from.toISOString(),
    yearMinus3To: boundaries.yearMinus3.to.toISOString(),
  };
}
