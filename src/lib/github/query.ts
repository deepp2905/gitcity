/**
 * Fetches the rolling "last 12 months" collection plus four calendar-year
 * candidates (current year + three preceding — see
 * src/lib/contributions/periods.ts#staticCandidateYears) in one GraphQL
 * request, using aliases. GraphQL aliases have to be static text, so the
 * *set* of years is fixed up front from the server clock; which of those
 * candidate years actually become visible tabs is decided afterwards in
 * normalize.ts, from the `contributionYears` GitHub reports.
 *
 * Only public/profile-visible fields are requested — no repository
 * details, and no `restrictedContributionsCount` (GitHub's API already
 * anonymizes/omits private contributions itself based on the target
 * profile's own visibility settings; `totalContributions` and the
 * calendar days it returns for an unauthenticated-context lookup are
 * exactly what the public profile shows).
 */
export const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query ContributionCityCalendars(
    $login: String!
    $last12From: DateTime!
    $last12To: DateTime!
    $currentYearFrom: DateTime!
    $currentYearTo: DateTime!
    $yearMinus1From: DateTime!
    $yearMinus1To: DateTime!
    $yearMinus2From: DateTime!
    $yearMinus2To: DateTime!
    $yearMinus3From: DateTime!
    $yearMinus3To: DateTime!
  ) {
    user(login: $login) {
      login
      name
      avatarUrl
      url
      last12Months: contributionsCollection(from: $last12From, to: $last12To) {
        contributionYears
        ...CalendarFields
      }
      currentYear: contributionsCollection(
        from: $currentYearFrom
        to: $currentYearTo
      ) {
        ...CalendarFields
      }
      yearMinus1: contributionsCollection(
        from: $yearMinus1From
        to: $yearMinus1To
      ) {
        ...CalendarFields
      }
      yearMinus2: contributionsCollection(
        from: $yearMinus2From
        to: $yearMinus2To
      ) {
        ...CalendarFields
      }
      yearMinus3: contributionsCollection(
        from: $yearMinus3From
        to: $yearMinus3To
      ) {
        ...CalendarFields
      }
    }
  }

  fragment CalendarFields on ContributionsCollection {
    contributionCalendar {
      totalContributions
      weeks {
        contributionDays {
          contributionCount
          date
          weekday
          contributionLevel
        }
      }
    }
  }
`;

export const YEAR_ALIASES = [
  "currentYear",
  "yearMinus1",
  "yearMinus2",
  "yearMinus3",
] as const;

export type YearAlias = (typeof YEAR_ALIASES)[number];

export type ContributionsQueryVariables = {
  login: string;
  last12From: string;
  last12To: string;
  currentYearFrom: string;
  currentYearTo: string;
  yearMinus1From: string;
  yearMinus1To: string;
  yearMinus2From: string;
  yearMinus2To: string;
  yearMinus3From: string;
  yearMinus3To: string;
};
