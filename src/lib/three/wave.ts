/**
 * The loading wave: a sine travelling across the week columns while a
 * search is in flight.
 *
 * Driven per column rather than per day, so each week moves as one unit
 * and the wave reads as a single front crossing the city instead of noise.
 *
 * It drives colour only. The wave runs exclusively in the flat state,
 * where an orthographic camera looking straight down renders no height
 * whatsoever, so colour is the only channel that can carry it: each
 * column steps through the heatmap's own five levels, from the neutral
 * ground cream up to the deepest green and back.
 *
 * A triangle rather than a sine. The value is quantized into five bands,
 * and a sine does not spend equal time in each — it lingers near its
 * extremes, so roughly 60% of every cycle would sit on either cream or
 * the darkest green and the three greens between them would flicker past.
 * A triangle climbs and descends linearly, so every preset gets an equal
 * share of the cycle.
 */

/** Columns per full wavelength. Roughly a quarter of a year per crest. */
export const WAVE_WAVELENGTH_COLUMNS = 13;

/** Crests per second. */
export const WAVE_SPEED_HZ = 0.55;

/**
 * How much per-column randomness rides on top, as a fraction of the
 * amplitude. Enough to stop it looking like a rendered formula, small
 * enough that the front still reads as a front.
 */
export const WAVE_JITTER = 0.22;

/**
 * How long the wave takes to subside once the search resolves.
 *
 * It has to land, not stop. A free-running sine is at an arbitrary phase
 * whenever the data happens to arrive, and roughly half the columns are
 * then at or near the deepest green — darker than almost anything in a
 * real contribution year. Cutting straight to the data left that dark
 * band on screen to fade *down*, which read as a flash.
 *
 * Decaying the amplitude to zero first takes the whole grid to cream, so
 * the data paints up from a blank chart instead of down from a false one.
 */
export const WAVE_SETTLE_MS = 260;

/** Deterministic per-column offset in -1..1, so a column keeps the same
 * character frame to frame rather than shimmering. */
export function columnJitter(weekIndex: number): number {
  const hashed = Math.sin(weekIndex * 12.9898 + 78.233) * 43758.5453;
  return (hashed - Math.floor(hashed)) * 2 - 1;
}

/**
 * Wave amplitude for a column at a point in time, as 0..1.
 *
 * `elapsedSeconds` rather than a frame count so the wave runs at the same
 * speed whatever the frame rate.
 */
export function waveAt(
  weekIndex: number,
  elapsedSeconds: number,
  jitterAmount = WAVE_JITTER,
): number {
  // Position within the current cycle, 0..1. Subtracting the column
  // index is what makes the wave travel: each column runs the same cycle
  // a little behind its neighbour.
  const cycles =
    elapsedSeconds * WAVE_SPEED_HZ - weekIndex / WAVE_WAVELENGTH_COLUMNS;
  const position = cycles - Math.floor(cycles);

  // Triangle: 0 at the ends of the cycle, 1 in the middle.
  const base = 1 - Math.abs(1 - 2 * position);
  const jittered = base + columnJitter(weekIndex) * jitterAmount;

  return jittered > 0 ? (jittered < 1 ? jittered : 1) : 0;
}
