import type { HeightScale } from "@/lib/contributions/height";

/**
 * Every tunable constant for the scene, in one place.
 *
 * These were previously scattered as module-level constants across the
 * layout, camera, lighting and animation code. Collecting them lets the
 * dev tuning panel drive the whole scene live, and makes it obvious what
 * is actually adjustable versus what is structural.
 */

export type SceneConfig = {
  /**
   * How a day's count maps onto height. "sqrt" lifts the low end so
   * ordinary days still read as buildings; "linear" is exposed purely to
   * compare the two in the dev panel.
   */
  heightScale: HeightScale;

  /** Frame-rate readout in the corner of the viewport. */
  showFps: boolean;

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
   * Changing period retargets heights over this long: eased rather than
   * sprung, and unstaggered. The bounce belongs to the 2D/3D transform,
   * where it reads as the city arriving; on a year change it reads as
   * instability in the data itself, and a wave draws attention to the
   * transition rather than to the year that replaced it.
   */
  yearMorphMs: number;

  // --- Colour fade in the flat (2D) state ---
  /**
   * Time for the recolour wave to cross the grid when the period changes
   * while flat. Defaults to 0: a flat grid is a chart, and a uniform fade
   * reads as a single value change where a wave draws attention to the
   * transition itself. Separate from staggerTotalMs, which paces the 3D
   * rise, so raising it here does not disturb the skyline.
   */
  colorStaggerMs: number;
  /** How long an individual tile takes to reach its new colour. */
  colorFadeMs: number;
  /**
   * How far the camera must have tilted before the rise starts, 0..1.
   * Straight down under orthographic projection shows no height at all,
   * so a wave that runs while the camera is still overhead is invisible.
   */
  riseStartProgress: number;

  // --- Camera transform ---
  transformDurationMs: number;
  /**
   * How far off vertical the flat view sits. This is a stability guard,
   * not a design control: at exactly 0 the camera's up vector parallels
   * its view direction and lookAt degenerates into NaNs. A couple of
   * degrees is enough, and foreshortens by ~0.06% -- which is why moving
   * this slider looks like it does nothing.
   */
  flatPolarDeg: number;
  cityPolarDeg: number;
  cityAzimuthDeg: number;
  /** Fraction of the canvas the city fills. */
  zoomPadding: number;
  /**
   * How much taller a building directly under the pointer grows, as a
   * fraction of its own height. Dock magnification, for a skyline. 0
   * disables it.
   */
  hoverSwellStrength: number;
  /**
   * Half-width of the swell in grid columns, measured along the week axis
   * only. Bigger lifts more of the year at once and reads as a slower,
   * heavier bulge; too small and the ridge reads as a playhead scrubbing
   * the chart rather than as the city responding.
   */
  hoverSwellRadius: number;

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
  heightScale: "sqrt",
  showFps: false,

  stiffness: 160,
  dampingRatio: 0.4,
  staggerTotalMs: 600,
  staggerCurve: 1,
  flattenDurationMs: 600,
  yearMorphMs: 600,

  colorStaggerMs: 0,
  colorFadeMs: 800,
  riseStartProgress: 0.24,

  transformDurationMs: 600,
  flatPolarDeg: 2,
  cityPolarDeg: 63,
  cityAzimuthDeg: -16,
  zoomPadding: 0.6,
  hoverSwellStrength: 0.9,
  hoverSwellRadius: 3,

  sceneMaxHeight: 8,
  groundTileHeight: 0.04,
  cellGap: 0.24,
  cornerRadiusRatio: 0.24,

  ambientIntensity: 1.6,
  directionalIntensity: 2,
  lightX: 16,
  lightY: 48,
  lightZ: 86,
  maxShadowOpacity: 0.06,
};

/** Keys whose value is a number, and so drivable by a slider. */
type NumericKey = {
  [K in keyof SceneConfig]: SceneConfig[K] extends number ? K : never;
}[keyof SceneConfig];

export type SliderSpec = {
  kind: "slider";
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Short note shown under the control. */
  hint?: string;
};

/** A control whose value is picked from a small fixed set. Written as a
 * union per key so each spec's options are typed to that key's value. */
export type ChoiceSpec =
  | {
      kind: "choice";
      key: "heightScale";
      label: string;
      options: readonly { value: HeightScale; label: string }[];
      hint?: string;
    }
  | {
      kind: "choice";
      key: "showFps";
      label: string;
      options: readonly { value: boolean; label: string }[];
      hint?: string;
    };

export type ControlSpec = SliderSpec | ChoiceSpec;

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
        kind: "slider",
        key: "stiffness",
        label: "Stiffness",
        min: 20,
        max: 600,
        step: 5,
        hint: "Speed of the rise",
      },
      {
        kind: "slider",
        key: "dampingRatio",
        label: "Damping ratio",
        min: 0.2,
        max: 1.2,
        step: 0.01,
        hint: "1 = no bounce, lower = bouncier",
      },
      {
        kind: "slider",
        key: "staggerTotalMs",
        label: "Stagger total",
        min: 0,
        max: 1600,
        step: 10,
        hint: "Time for the wave to cross",
      },
      {
        kind: "slider",
        key: "staggerCurve",
        label: "Stagger curve",
        min: 0.3,
        max: 3,
        step: 0.05,
        hint: "1 = linear, >1 starts slow",
      },
      {
        kind: "slider",
        key: "flattenDurationMs",
        label: "Flatten duration",
        min: 120,
        max: 1600,
        step: 20,
        hint: "Eased, never sprung",
      },
      {
        kind: "slider",
        key: "yearMorphMs",
        label: "Year morph",
        min: 120,
        max: 1600,
        step: 20,
        hint: "Eased and unstaggered",
      },
      {
        kind: "slider",
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
    title: "Colour fade (2D)",
    controls: [
      {
        kind: "slider",
        key: "colorStaggerMs",
        label: "Stagger",
        min: 0,
        max: 1200,
        step: 10,
        hint: "0 fades all tiles together",
      },
      {
        kind: "slider",
        key: "colorFadeMs",
        label: "Fade",
        min: 0,
        max: 800,
        step: 10,
        hint: "Per tile; 0 snaps",
      },
    ],
  },
  {
    title: "Height scale",
    controls: [
      {
        kind: "choice",
        key: "heightScale",
        label: "Curve",
        options: [
          { value: "sqrt", label: "Square root" },
          { value: "linear", label: "Linear" },
        ],
        hint: "Linear lets one busy day flatten the rest",
      },
    ],
  },
  {
    title: "Camera",
    controls: [
      { kind: "slider",
        key: "transformDurationMs", label: "Transform", min: 200, max: 2500, step: 25 },
      {
        kind: "slider",
        key: "flatPolarDeg",
        label: "Flat angle",
        min: 0.5,
        max: 12,
        step: 0.5,
        hint: "Stability guard; visually near-identical",
      },
      { kind: "slider",
        key: "cityPolarDeg", label: "City angle", min: 15, max: 80, step: 1 },
      { kind: "slider",
        key: "cityAzimuthDeg", label: "Azimuth", min: -180, max: 180, step: 1 },
      { kind: "slider",
        key: "zoomPadding", label: "Zoom padding", min: 0.5, max: 1, step: 0.01 },
      {
        kind: "slider",
        key: "hoverSwellStrength",
        label: "Hover swell",
        min: 0,
        max: 2.5,
        step: 0.05,
        hint: "Extra height under the pointer; 0 disables",
      },
      {
        kind: "slider",
        key: "hoverSwellRadius",
        label: "Swell radius",
        min: 1,
        max: 16,
        step: 0.5,
        hint: "Falloff distance, in columns",
      },
    ],
  },
  {
    title: "Geometry",
    controls: [
      { kind: "slider",
        key: "sceneMaxHeight", label: "Max height", min: 1, max: 20, step: 0.5 },
      { kind: "slider",
        key: "groundTileHeight", label: "Ground tile", min: 0.002, max: 0.3, step: 0.002 },
      { kind: "slider",
        key: "cellGap", label: "Cell gap", min: 0, max: 1, step: 0.01 },
      { kind: "slider",
        key: "cornerRadiusRatio", label: "Corner radius", min: 0, max: 0.5, step: 0.01 },
    ],
  },
  {
    title: "Debug",
    controls: [
      {
        kind: "choice",
        key: "showFps",
        label: "FPS monitor",
        options: [
          { value: false, label: "No" },
          { value: true, label: "Yes" },
        ],
      },
    ],
  },
  {
    title: "Light and shadow",
    controls: [
      { kind: "slider",
        key: "ambientIntensity", label: "Ambient", min: 0, max: 4, step: 0.05 },
      { kind: "slider",
        key: "directionalIntensity", label: "Directional", min: 0, max: 5, step: 0.05 },
      { kind: "slider",
        key: "lightX", label: "Light X", min: -100, max: 100, step: 1 },
      { kind: "slider",
        key: "lightY", label: "Light Y", min: 5, max: 150, step: 1 },
      { kind: "slider",
        key: "lightZ", label: "Light Z", min: -100, max: 100, step: 1 },
      { kind: "slider",
        key: "maxShadowOpacity", label: "Shadow", min: 0, max: 0.6, step: 0.01 },
    ],
  },
];

/** Damping coefficient for a unit mass, from stiffness and ratio. */
export function dampingCoefficient(stiffness: number, ratio: number): number {
  return 2 * ratio * Math.sqrt(stiffness);
}
