import { DEFAULT_SCENE_CONFIG } from "./config";

/**
 * Scene geometry for the 3D city.
 *
 * The grid maps 1:1 onto the 2D heatmap so the transition reads as the
 * same object lifting: weeks run along X exactly as heatmap columns do,
 * weekdays along Z exactly as rows do. Y is contribution height.
 *
 * Sizes that the tuning panel can change are parameters with defaults,
 * rather than module constants, so the whole scene can be re-laid-out
 * live without a reload.
 */

/** Footprint of one day tile. This is the scene's unit; everything else
 * is expressed relative to it, so it is deliberately not tunable. */
export const CELL_SIZE = 1;

export const WEEKDAY_COUNT = 7;

const { cellGap: DEFAULT_GAP, sceneMaxHeight: DEFAULT_MAX_HEIGHT } =
  DEFAULT_SCENE_CONFIG;

/** Distance between the centres of adjacent tiles. */
export function pitch(gap: number = DEFAULT_GAP): number {
  return CELL_SIZE + gap;
}

/** Total width (X) of a grid with `weekCount` columns. */
export function gridWidth(weekCount: number, gap: number = DEFAULT_GAP): number {
  return Math.max(0, weekCount * pitch(gap) - gap);
}

/** Total depth (Z) of the seven weekday rows. */
export function gridDepth(gap: number = DEFAULT_GAP): number {
  return WEEKDAY_COUNT * pitch(gap) - gap;
}

/**
 * Centre position of a tile on the ground plane. The grid is centred on
 * the origin so camera framing and orbit don't depend on period length.
 */
export function tilePosition(
  weekIndex: number,
  weekday: number,
  weekCount: number,
  gap: number = DEFAULT_GAP,
): { x: number; z: number } {
  const step = pitch(gap);
  const originX = -(gridWidth(weekCount, gap) - CELL_SIZE) / 2;
  const originZ = -(gridDepth(gap) - CELL_SIZE) / 2;
  return {
    x: originX + weekIndex * step,
    z: originZ + weekday * step,
  };
}

/** Maps a normalized 0..1 height onto world units. */
export function worldHeight(
  normalizedHeight: number,
  maxHeight: number = DEFAULT_MAX_HEIGHT,
): number {
  return normalizedHeight * maxHeight;
}
