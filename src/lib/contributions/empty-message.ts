/**
 * Copy for a period with no contributions at all.
 *
 * An empty year keeps its tab rather than disappearing — a silent year is
 * part of the story, and dropping tabs makes the control jump around. But
 * a blank grid with no explanation looks like a loading bug, so the city
 * says something instead.
 */

type EmptyMessage = { headline: string; detail: string };

const MESSAGES: EmptyMessage[] = [
  {
    headline: "Nothing built here yet",
    detail: "Zero contributions this year. Great views, though.",
  },
  {
    headline: "A very quiet year",
    detail: "Not a single brick was laid. The cranes stayed home.",
  },
  {
    headline: "Prime undeveloped land",
    detail: "No contributions on record. Zoning permits still pending.",
  },
  {
    headline: "The planners took a sabbatical",
    detail: "Nothing was committed here. Not even a shed.",
  },
];

/** Deterministic per period, so the message never changes under you on a
 * re-render or a return visit. */
export function emptyPeriodMessage(periodId: string): EmptyMessage {
  let hash = 0;
  for (let i = 0; i < periodId.length; i++) {
    hash = (hash * 31 + periodId.charCodeAt(i)) >>> 0;
  }
  return MESSAGES[hash % MESSAGES.length];
}
