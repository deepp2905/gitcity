/**
 * Scene geometry for the 3D city.
 *
 * The grid maps 1:1 onto the 2D heatmap so the transition reads as the
 * same object lifting: weeks run along X exactly as heatmap columns do,
 * weekdays along Z exactly as rows do. Y is contribution height.
 */

/** Footprint of one day tile, in world units. */
export const CELL_SIZE = 1;

/** Gap between tiles, proportionally matching the 2D grid's 3px/13px. */
export const CELL_GAP = 0.23;

/** Distance between the centres of adjacent tiles. */
export const PITCH = CELL_SIZE + CELL_GAP;

export const WEEKDAY_COUNT = 7;

/**
 * World height the tallest building in any period reaches. Normalized
 * heights (0..1 from computeBuildingHeight) scale onto this, so periods
 * stay comparable in shape while each is normalized to its own max.
 * ~6x the cell width reads as a tower rather than a squat block.
 */
export const SCENE_MAX_HEIGHT = 6;

/** Total width (X) of a grid with `weekCount` columns. */
export function gridWidth(weekCount: number): number {
  return Math.max(0, weekCount * PITCH - CELL_GAP);
}

/** Total depth (Z) of the seven weekday rows. */
export function gridDepth(): number {
  return WEEKDAY_COUNT * PITCH - CELL_GAP;
}

/**
 * Centre position of a tile on the ground plane. The grid is centred on
 * the origin so camera framing and orbit don't depend on period length.
 */
export function tilePosition(
  weekIndex: number,
  weekday: number,
  weekCount: number,
): { x: number; z: number } {
  const originX = -(gridWidth(weekCount) - CELL_SIZE) / 2;
  const originZ = -(gridDepth() - CELL_SIZE) / 2;
  return {
    x: originX + weekIndex * PITCH,
    z: originZ + weekday * PITCH,
  };
}

/** Maps a normalized 0..1 height onto world units. */
export function worldHeight(normalizedHeight: number): number {
  return normalizedHeight * SCENE_MAX_HEIGHT;
}

/**
 * Per-week delay for the rise animation, so buildings sweep left to
 * right as a wave rather than popping up together. Spread across a fixed
 * budget so a 53-week year and a 20-week partial period feel the same.
 */
export const RISE_WAVE_DURATION_MS = 520;

export function riseDelayMs(weekIndex: number, weekCount: number): number {
  if (weekCount <= 1) return 0;
  return (weekIndex / (weekCount - 1)) * RISE_WAVE_DURATION_MS;
}
