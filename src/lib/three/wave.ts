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
 * Phase offset per weekday, in cycles, for the diagonal treatment.
 *
 * Across seven rows this is a third of a cycle top to bottom — enough to
 * read as a slant rather than as bars, small enough that the front is
 * still one front.
 */
export const WAVE_WEEKDAY_PHASE = 0.05;

/**
 * Share of a cycle the sharp-front treatment spends rising.
 *
 * The rest is the tail. A symmetric triangle has no direction — it reads
 * as pulsing in place — where a fast edge followed by a long decay reads
 * as something passing through.
 */
export const WAVE_FRONT_SHARE = 0.18;

/** Smallest footprint a tile shrinks to between crests, as a fraction of
 * a full cell, for the pulse-scale treatment. */
export const WAVE_MIN_FOOTPRINT = 0.82;

/** Which treatments are switched on. All off is the plain travelling
 * triangle the wave shipped with. */
export type WaveShape = {
  diagonal: boolean;
  sharpFront: boolean;
};

/**
 * How long the wave takes to subside once the search resolves.
 *
 * It has to land, not stop. The wave is at an arbitrary phase whenever
 * the data happens to arrive, and a good share of the columns are sitting
 * on the deepest green — darker than almost anything in a real
 * contribution year. Cutting straight to the data left that band on
 * screen to fade *down*, which read as a flash.
 *
 * Over this window each tile crosses from its wave colour to its own
 * data colour. Deliberately per tile and not through a shared value:
 * decaying the amplitude to zero first was smooth, but it took the entire
 * grid to cream on the way, and a chart that blanks before it fills reads
 * as a second load rather than the end of the first.
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
  weekday: number,
  elapsedSeconds: number,
  shape: WaveShape,
  jitterAmount = WAVE_JITTER,
): number {
  // Position within the current cycle, 0..1. Subtracting the column
  // index is what makes the wave travel: each column runs the same cycle
  // a little behind its neighbour.
  //
  // The weekday term does the same thing down the grid, so the front
  // arrives at Saturday later than at Sunday and the whole thing leans.
  const cycles =
    elapsedSeconds * WAVE_SPEED_HZ -
    weekIndex / WAVE_WAVELENGTH_COLUMNS -
    (shape.diagonal ? weekday * WAVE_WEEKDAY_PHASE : 0);
  const position = cycles - Math.floor(cycles);

  const base = shape.sharpFront
    ? // Fast rise, slow decay.
      position < WAVE_FRONT_SHARE
      ? position / WAVE_FRONT_SHARE
      : 1 - (position - WAVE_FRONT_SHARE) / (1 - WAVE_FRONT_SHARE)
    : // Triangle: 0 at the ends of the cycle, 1 in the middle.
      1 - Math.abs(1 - 2 * position);

  const jittered = base + columnJitter(weekIndex) * jitterAmount;

  return jittered > 0 ? (jittered < 1 ? jittered : 1) : 0;
}
