import type { ContributionLevel } from "@/lib/contributions/types";

/** Loose types for GitHub's GraphQL response shape — external API, so we
 * treat fields defensively (normalize.ts guards before trusting them)
 * rather than assuming the schema never changes shape underneath us. */

export type RawContributionDay = {
  contributionCount: number;
  date: string;
  weekday: number;
  contributionLevel: ContributionLevel;
};

export type RawContributionsCollection = {
  contributionYears?: number[];
  contributionCalendar: {
    totalContributions: number;
    weeks: { contributionDays: RawContributionDay[] }[];
  };
};

export type RawUser = {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
  last12Months: RawContributionsCollection;
  currentYear: RawContributionsCollection;
  yearMinus1: RawContributionsCollection;
  yearMinus2: RawContributionsCollection;
  yearMinus3: RawContributionsCollection;
};

export type GraphQLError = {
  type?: string;
  message: string;
  path?: (string | number)[];
};

export type RawContributionsQueryResult = {
  data?: { user: RawUser | null } | null;
  errors?: GraphQLError[];
};
