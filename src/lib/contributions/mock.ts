import type { ContributionDay, ContributionLevel, ContributionPeriod } from "./types";
import {
  enumerateDays,
  rollingLast12MonthsFrom,
  toIsoDate,
  weekIndexOf,
  weekdayOf,
} from "./periods";

/**
 * A plausible-looking contribution year, for the idle state before anyone
 * has searched.
 *
 * Deterministic on purpose. A different pattern on the server and the
 * client would be a hydration mismatch, and a pattern that reshuffled on
 * every render would flicker. The seed is fixed, so this is the same city
 * every time.
 *
 * It is shaped rather than uniformly random: weekends are quieter,
 * activity comes in runs, and a few days spike. Uniform noise reads as
 * static and gives the eye nothing to hold, which is exactly what a real
 * contribution graph does not look like.
 */

/** Small, fast, deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_SEED = 0x9e3779b9;

/** Weekends are quieter, mid-week busier. */
const WEEKDAY_WEIGHT = [0.35, 1, 1.05, 1, 0.95, 0.8, 0.3];

function levelFor(count: number, max: number): ContributionLevel {
  if (count <= 0) return "NONE";
  const ratio = count / Math.max(max, 1);
  if (ratio <= 0.25) return "FIRST_QUARTILE";
  if (ratio <= 0.5) return "SECOND_QUARTILE";
  if (ratio <= 0.75) return "THIRD_QUARTILE";
  return "FOURTH_QUARTILE";
}

/**
 * Builds the idle period. `now` is a parameter so the result is testable
 * and so callers can pin it rather than depending on the clock.
 */
export function buildMockPeriod(now: Date): ContributionPeriod {
  const random = mulberry32(MOCK_SEED);
  const from = rollingLast12MonthsFrom(now);
  const dates = enumerateDays(from, now);

  // A slow drift so the year has quiet months and busy ones, rather than
  // the same density throughout.
  const driftPhase = random() * Math.PI * 2;

  const raw: number[] = [];
  let streak = 0;

  for (let i = 0; i < dates.length; i++) {
    const weekday = weekdayOf(dates[i]);
    const season = 0.55 + 0.45 * Math.sin(driftPhase + (i / dates.length) * Math.PI * 3);
    const weight = WEEKDAY_WEIGHT[weekday] * season;

    // Runs of activity, then runs of nothing: real work arrives in
    // stretches rather than being sprinkled evenly.
    if (streak > 0) streak -= 1;
    else if (random() < 0.18 * weight) streak = 2 + Math.floor(random() * 6);

    const active = streak > 0 || random() < 0.32 * weight;
    if (!active) {
      raw.push(0);
      continue;
    }

    const base = 1 + Math.floor(random() * 7 * weight);
    // Occasional outlier, which is what forces the sqrt height scale.
    const spike = random() < 0.02 ? 12 + Math.floor(random() * 30) : 0;
    raw.push(base + spike);
  }

  const max = raw.reduce((highest, count) => Math.max(highest, count), 0);

  const days: ContributionDay[] = dates.map((date, i) => ({
    date: toIsoDate(date),
    count: raw[i],
    level: levelFor(raw[i], max),
    weekday: weekdayOf(date),
    weekIndex: weekIndexOf(date, from),
  }));

  return {
    id: "last-12-months",
    label: "Last 12 months",
    from: toIsoDate(from),
    to: toIsoDate(now),
    totalContributions: raw.reduce((sum, count) => sum + count, 0),
    days,
  };
}
