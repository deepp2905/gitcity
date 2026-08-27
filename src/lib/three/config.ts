/**
 * Every tunable constant for the scene, in one place.
 *
 * These were previously scattered as module-level constants across the
 * layout, camera, lighting and animation code. Collecting them lets the
 * dev tuning panel drive the whole scene live, and makes it obvious what
 * is actually adjustable versus what is structural.
 */

export type SceneConfig = {
  // --- Building rise (spring) ---
  /** Spring constant. Higher rises faster; independent of bounce. */
  stiffness: number;
  /**
   * Damping ratio. 1 is critically damped (no overshoot); below 1
   * overshoots and settles back: ~0.7 gives a ~5% pop, ~0.4 a ~25% one.
   */
  dampingRatio: number;
  /** Time for the rise wave to cross the whole city, left to right. */
  staggerTotalMs: number;
  /**
   * Shape of the delay curve across columns. 1 is linear; above 1 makes
   * the wave start slow and accelerate; below 1 front-loads it.
   */
  staggerCurve: number;
  /** Flattening is eased rather than sprung, over this long. */
  flattenDurationMs: number;
  /**
   * How far the camera must have tilted before the rise starts, 0..1.
   * Straight down under orthographic projection shows no height at all,
   * so a wave that runs while the camera is still overhead is invisible.
   */
  riseStartProgress: number;

  // --- Camera transform ---
  transformDurationMs: number;
  /** Not 0: at exactly vertical lookAt degenerates. */
  flatPolarDeg: number;
  cityPolarDeg: number;
  cityAzimuthDeg: number;
  /** Fraction of the canvas the city fills. */
  zoomPadding: number;

  // --- Scene geometry ---
  sceneMaxHeight: number;
  groundTileHeight: number;
  cellGap: number;
  cornerRadiusRatio: number;

  // --- Lighting and shadow ---
  ambientIntensity: number;
  directionalIntensity: number;
  lightX: number;
  lightY: number;
  lightZ: number;
  maxShadowOpacity: number;
};

export const DEFAULT_SCENE_CONFIG: SceneConfig = {
  stiffness: 190,
  dampingRatio: 0.4,
  staggerTotalMs: 400,
  staggerCurve: 1,
  flattenDurationMs: 800,
  riseStartProgress: 0.28,

  transformDurationMs: 800,
  flatPolarDeg: 2,
  cityPolarDeg: 52,
  cityAzimuthDeg: -34,
  zoomPadding: 0.95,

  sceneMaxHeight: 8,
  groundTileHeight: 0.012,
  cellGap: 0.24,
  cornerRadiusRatio: 0.24,

  ambientIntensity: 1.7,
  directionalIntensity: 1.9,
  lightX: 30,
  lightY: 50,
  lightZ: 20,
  maxShadowOpacity: 0.14,
};

export type ControlKind = "slider";

export type ControlSpec = {
  key: keyof SceneConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Short note shown under the control. */
  hint?: string;
};

export type ControlGroup = {
  title: string;
  controls: ControlSpec[];
};

/** Drives the dev tuning panel's layout. */
export const CONTROL_GROUPS: ControlGroup[] = [
  {
    title: "Building spring",
    controls: [
      {
        key: "stiffness",
        label: "Stiffness",
        min: 20,
        max: 600,
        step: 5,
        hint: "Speed of the rise",
      },
      {
        key: "dampingRatio",
        label: "Damping ratio",
        min: 0.2,
        max: 1.2,
        step: 0.01,
        hint: "1 = no bounce, lower = bouncier",
      },
      {
        key: "staggerTotalMs",
        label: "Stagger total",
        min: 0,
        max: 1600,
        step: 10,
        hint: "Time for the wave to cross",
      },
      {
        key: "staggerCurve",
        label: "Stagger curve",
        min: 0.3,
        max: 3,
        step: 0.05,
        hint: "1 = linear, >1 starts slow",
      },
      {
        key: "flattenDurationMs",
        label: "Flatten duration",
        min: 120,
        max: 1600,
        step: 20,
        hint: "Eased, never sprung",
      },
      {
        key: "riseStartProgress",
        label: "Rise start",
        min: 0,
        max: 0.8,
        step: 0.01,
        hint: "Tilt reached before rising",
      },
    ],
  },
  {
    title: "Camera",
    controls: [
      { key: "transformDurationMs", label: "Transform", min: 200, max: 2500, step: 25 },
      { key: "flatPolarDeg", label: "Flat angle", min: 0.5, max: 12, step: 0.5 },
      { key: "cityPolarDeg", label: "City angle", min: 15, max: 80, step: 1 },
      { key: "cityAzimuthDeg", label: "Azimuth", min: -180, max: 180, step: 1 },
      { key: "zoomPadding", label: "Zoom padding", min: 0.5, max: 1, step: 0.01 },
    ],
  },
  {
    title: "Geometry",
    controls: [
      { key: "sceneMaxHeight", label: "Max height", min: 1, max: 20, step: 0.5 },
      { key: "groundTileHeight", label: "Ground tile", min: 0.002, max: 0.3, step: 0.001 },
      { key: "cellGap", label: "Cell gap", min: 0, max: 1, step: 0.01 },
      { key: "cornerRadiusRatio", label: "Corner radius", min: 0, max: 0.5, step: 0.01 },
    ],
  },
  {
    title: "Light and shadow",
    controls: [
      { key: "ambientIntensity", label: "Ambient", min: 0, max: 4, step: 0.05 },
      { key: "directionalIntensity", label: "Directional", min: 0, max: 5, step: 0.05 },
      { key: "lightX", label: "Light X", min: -100, max: 100, step: 1 },
      { key: "lightY", label: "Light Y", min: 5, max: 150, step: 1 },
      { key: "lightZ", label: "Light Z", min: -100, max: 100, step: 1 },
      { key: "maxShadowOpacity", label: "Shadow", min: 0, max: 0.6, step: 0.01 },
    ],
  },
];

/** Damping coefficient for a unit mass, from stiffness and ratio. */
export function dampingCoefficient(stiffness: number, ratio: number): number {
  return 2 * ratio * Math.sqrt(stiffness);
}
