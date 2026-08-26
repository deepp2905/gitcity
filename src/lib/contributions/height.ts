/**
 * Square-root building-height scale for the 3D skyline.
 *
 * Zero-contribution days stay thin ground tiles, distinct from the small
 * base a real (low-count) building starts at. Each period is normalized
 * independently by its own `maxCount`, per spec.
 */

/** Thin ground-tile height for days with zero contributions. */
export const GROUND_TILE_HEIGHT = 0.04;

/** Smallest height a building (count >= 1) can have. */
export const BUILDING_MIN_HEIGHT = 0.12;

/** Fixed scene maximum every period's tallest building reaches. */
export const BUILDING_MAX_HEIGHT = 1;

/**
 * `normalized = sqrt(count / maxCount)`, mapped onto
 * [BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT] for active days, or
 * GROUND_TILE_HEIGHT for zero-contribution days.
 */
export function computeBuildingHeight(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return GROUND_TILE_HEIGHT;

  const normalized = Math.sqrt(Math.min(count, maxCount) / maxCount);
  return (
    BUILDING_MIN_HEIGHT + normalized * (BUILDING_MAX_HEIGHT - BUILDING_MIN_HEIGHT)
  );
}
