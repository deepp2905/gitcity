/**
 * Camera choreography for the single-scene 2D -> 3D transform.
 *
 * The scene is ALWAYS 3D and always orthographic. The "2D" state is just
 * the camera looking almost straight down: with no perspective vanishing
 * point, a top-down ortho view of flat tiles is pixel-identical to a flat
 * grid of squares, which is what lets one scene serve both states.
 */

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Not exactly 0°: at a perfectly vertical view the camera's up vector is
 * parallel to its view direction and lookAt degenerates. 2° keeps the
 * math stable while foreshortening only 0.06% — invisible.
 */
export const FLAT_POLAR_DEG = 2;
export const CITY_POLAR_DEG = 52;
export const CITY_AZIMUTH_DEG = -34;

export type CameraView = {
  /** Polar angle from straight up, radians. */
  phi: number;
  /** Azimuth around the Y axis, radians. */
  theta: number;
  /** Multiplier on the fitted zoom — the tilted view needs room for height. */
  zoomScale: number;
};

export const FLAT_VIEW: CameraView = {
  phi: degToRad(FLAT_POLAR_DEG),
  theta: 0,
  zoomScale: 1,
};

export const CITY_VIEW: CameraView = {
  phi: degToRad(CITY_POLAR_DEG),
  theta: degToRad(CITY_AZIMUTH_DEG),
  zoomScale: 0.72,
};

/** Spherical -> cartesian, with phi measured from +Y so phi=0 is directly
 * overhead. Radius is arbitrary under orthographic projection (it doesn't
 * affect scale) but must clear the geometry and the near plane. */
export function sphericalToCartesian(
  phi: number,
  theta: number,
  radius: number,
): { x: number; y: number; z: number } {
  return {
    x: radius * Math.sin(phi) * Math.sin(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.cos(theta),
  };
}

/** Strong ease-in-out: slow start, quick middle, gentle settle. */
export function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Interpolates the camera between the flat and tilted views. */
export function lerpView(t: number): CameraView {
  const eased = easeInOutCubic(t);
  return {
    phi: lerp(FLAT_VIEW.phi, CITY_VIEW.phi, eased),
    theta: lerp(FLAT_VIEW.theta, CITY_VIEW.theta, eased),
    zoomScale: lerp(FLAT_VIEW.zoomScale, CITY_VIEW.zoomScale, eased),
  };
}

/**
 * Orthographic zoom, in pixels per world unit, that fits the grid inside
 * the canvas with padding. R3F's default ortho frustum is the viewport in
 * pixels, so `zoom` is exactly that pixels-per-unit ratio.
 *
 * At the top-down view world X maps to screen X and world Z to screen Y,
 * so the same number positions the DOM label overlay.
 */
export function fitZoom(
  canvasWidth: number,
  canvasHeight: number,
  gridWidth: number,
  gridDepth: number,
  padding = 0.88,
): number {
  if (gridWidth <= 0 || gridDepth <= 0) return 1;
  if (canvasWidth <= 0 || canvasHeight <= 0) return 1;

  return Math.min(
    (canvasWidth * padding) / gridWidth,
    (canvasHeight * padding) / gridDepth,
  );
}

/**
 * Screen position of a world point at the flat view, relative to the
 * canvas's top-left. Only valid at (or very near) the top-down camera,
 * which is all the label overlay needs — it fades out as the tilt starts.
 */
export function projectFlat(
  worldX: number,
  worldZ: number,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
): { left: number; top: number } {
  return {
    left: canvasWidth / 2 + worldX * zoom,
    top: canvasHeight / 2 + worldZ * zoom,
  };
}

/**
 * How far into the 0..1 transform a given week column has progressed.
 * Later columns start later, producing a left-to-right rise wave; the
 * wave is a fraction of the whole transform so the last column still
 * finishes exactly at 1.
 */
export const RISE_WAVE_FRACTION = 0.45;

export function columnProgress(
  progress: number,
  weekIndex: number,
  weekCount: number,
): number {
  if (weekCount <= 1) return Math.min(1, Math.max(0, progress));

  const delay = (weekIndex / (weekCount - 1)) * RISE_WAVE_FRACTION;
  const span = 1 - RISE_WAVE_FRACTION;
  return Math.min(1, Math.max(0, (progress - delay) / span));
}
