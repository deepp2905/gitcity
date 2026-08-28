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
 * Seeded, not deterministic. The default seed is fixed so the server and
 * the first client render agree — a different pattern between the two is
 * a hydration mismatch — and the caller re-seeds once on mount, so the
 * idle city is a different one on every visit. See CityApp.
 *
 * Almost every day is built on: an idle city should read as a city, and
 * a sparse one reads as an empty lot. The variety comes from height and
 * colour instead of from gaps, which is why the counts are skewed hard
 * rather than spread evenly — most days modest, some tall, a few
 * towers.
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

/** Fixed default, used for the server render and the first client one. */
export const MOCK_SEED = 0x9e3779b9;

/** Weekends are quieter, mid-week busier. */
const WEEKDAY_WEIGHT = [0.55, 1, 1.05, 1, 0.95, 0.85, 0.5];

/** Share of days left empty. Low: the gaps are punctuation, not texture. */
const QUIET_DAY_CHANCE = 0.07;

/** Chance a day is an outlier, which is what forces the sqrt height
 * scale to earn its keep. */
const SPIKE_CHANCE = 0.035;

/**
 * A seed for a fresh city.
 *
 * Client-only by construction: calling this during a server render would
 * produce markup the client could not reproduce.
 */
export function randomMockSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

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
export function buildMockPeriod(
  now: Date,
  seed: number = MOCK_SEED,
): ContributionPeriod {
  const random = mulberry32(seed);
  const from = rollingLast12MonthsFrom(now);
  const dates = enumerateDays(from, now);

  // Two drifts at different rates: one slow enough to give the year busy
  // months and quiet ones, one faster so neighbouring weeks differ. A
  // single sine makes the skyline read as one smooth swell.
  const seasonPhase = random() * Math.PI * 2;
  const wobblePhase = random() * Math.PI * 2;

  const raw: number[] = [];
  /** Days left of the current burst of heavier-than-usual activity. */
  let burst = 0;
  /** How much heavier this particular burst is. */
  let burstStrength = 1;

  for (let i = 0; i < dates.length; i++) {
    const weekday = weekdayOf(dates[i]);
    const progress = i / dates.length;

    // Both centred near 1 rather than reaching for zero. These multiply
    // with each other and with the weekday weight, so floors close to
    // zero compound into a year where the typical day is a single
    // contribution and the whole city sits on the ground.
    const season = 0.85 + 0.4 * Math.sin(seasonPhase + progress * Math.PI * 3);
    const wobble = 1 + 0.2 * Math.sin(wobblePhase + progress * Math.PI * 17);
    const weight = WEEKDAY_WEIGHT[weekday] * season * wobble;

    // Bursts raise the volume rather than switching activity on. With
    // nearly every day occupied, runs have to show up as clusters of
    // taller buildings or they do not show up at all.
    if (burst > 0) {
      burst -= 1;
    } else if (random() < 0.06) {
      burst = 3 + Math.floor(random() * 9);
      burstStrength = 1.6 + random() * 1.8;
    }
    const intensity = weight * (burst > 0 ? burstStrength : 1);

    // Quieter days are likelier to be the empty ones, so the gaps land
    // at weekends and in the slow months rather than at random.
    if (random() < QUIET_DAY_CHANCE * (1.4 - Math.min(weight, 1))) {
      raw.push(0);
      continue;
    }

    // Skewed low with a long tail, but only mildly. A flat random gives
    // every height equal odds and builds a plateau; squaring it buries
    // the median so far under the spikes that almost every building
    // renders at the floor. This lands the typical day around a third of
    // the way up, which is where the ramp has colours to spend.
    const base = 1 + Math.floor(Math.pow(random(), 1.5) * 20 * intensity);
    const spike =
      random() < SPIKE_CHANCE ? 12 + Math.floor(random() * 24) : 0;
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
