import type {
  ContributionDay,
  ContributionPeriod,
  ContributionResponse,
} from "@/lib/contributions/types";
import { selectCalendarYears, toIsoDate } from "@/lib/contributions/periods";
import { computeStaticBoundaries, type DateRange } from "./boundaries";
import { YEAR_ALIASES, type YearAlias } from "./query";
import type { RawContributionsCollection, RawUser } from "./raw-types";

function buildDays(collection: RawContributionsCollection): ContributionDay[] {
  const days: ContributionDay[] = [];
  collection.contributionCalendar.weeks.forEach((week, weekIndex) => {
    for (const day of week.contributionDays) {
      days.push({
        date: day.date,
        count: day.contributionCount,
        level: day.contributionLevel,
        weekday: day.weekday,
        weekIndex,
      });
    }
  });
  return days;
}

function buildPeriod(
  id: ContributionPeriod["id"],
  label: string,
  range: DateRange,
  collection: RawContributionsCollection,
): ContributionPeriod {
  return {
    id,
    label,
    from: toIsoDate(range.from),
    to: toIsoDate(range.to),
    totalContributions: collection.contributionCalendar.totalContributions,
    days: buildDays(collection),
  };
}

/**
 * Maps GitHub's raw GraphQL `user` payload into the public
 * `ContributionResponse` contract: the rolling period, plus whichever of
 * the four static candidate years GitHub actually reports contribution
 * history for (capped at four, most recent first).
 */
export function normalizeContributionsResponse(
  user: RawUser,
  now: Date,
): ContributionResponse {
  const boundaries = computeStaticBoundaries(now);

  const periods: ContributionPeriod[] = [
    buildPeriod(
      "last-12-months",
      "Last 12 months",
      boundaries.last12,
      user.last12Months,
    ),
  ];

  const reportedYears = user.last12Months.contributionYears ?? [];
  const visibleYears = selectCalendarYears(reportedYears);

  const aliasByYear = new Map<number, YearAlias>(
    boundaries.candidateYears.map((year, i) => [year, YEAR_ALIASES[i]]),
  );
  const rangeByAlias: Record<YearAlias, DateRange> = {
    currentYear: boundaries.currentYear,
    yearMinus1: boundaries.yearMinus1,
    yearMinus2: boundaries.yearMinus2,
    yearMinus3: boundaries.yearMinus3,
  };

  for (const year of visibleYears) {
    const alias = aliasByYear.get(year);
    // A reported year older than our static 4-year candidate window
    // (e.g. an account only active long ago) simply isn't queryable in
    // this request and is left out of the tab list.
    if (!alias) continue;

    periods.push(
      buildPeriod(`year-${year}`, String(year), rangeByAlias[alias], user[alias]),
    );
  }

  return {
    profile: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatarUrl,
      profileUrl: user.url,
    },
    periods,
  };
}
