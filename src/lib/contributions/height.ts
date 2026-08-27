/**
 * Building-height scale for the 3D skyline.
 *
 * Each period is normalized independently by its own `maxCount`, per
 * spec, so a sparse year still produces a readable skyline rather than a
 * flat lot. The trade-off is that heights are not comparable between
 * periods; the tooltip carries the exact count.
 */

export type HeightScale = "sqrt" | "linear";

/**
 * Where a count sits within its period, as 0..1.
 *
 * Contribution data is heavily skewed: a single busy day sets `maxCount`
 * and, under a linear scale, flattens every ordinary day against it. The
 * square root lifts the low end so those days still read as buildings —
 * at 1/82 of the max it returns 0.11 rather than 0.01.
 *
 * `linear` is offered for comparison in the dev tuning panel.
 */
export function normalizeCount(
  count: number,
  maxCount: number,
  scale: HeightScale = "sqrt",
): number {
  if (count <= 0 || maxCount <= 0) return 0;

  const fraction = Math.min(count, maxCount) / maxCount;
  return scale === "sqrt" ? Math.sqrt(fraction) : fraction;
}

/**
 * Maps a normalized 0..1 value onto [floor, 1].
 *
 * The floor is reserved, not added: the data gets the remaining range, so
 * raising it compresses the skyline rather than lifting it.
 */
export function scaleHeight(normalized: number, floor: number): number {
  return floor + normalized * (1 - floor);
}
