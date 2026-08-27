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
};

export const FLAT_VIEW: CameraView = {
  phi: degToRad(FLAT_POLAR_DEG),
  theta: 0,
};

export const CITY_VIEW: CameraView = {
  phi: degToRad(CITY_POLAR_DEG),
  theta: degToRad(CITY_AZIMUTH_DEG),
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

/**
 * Interpolates the camera between the flat view and a tilted view.
 *
 * The tilted end is a parameter rather than a constant because orbiting
 * redefines it: wherever the user leaves the camera becomes the "3D"
 * end of the transform, so flattening from a manually orbited angle
 * travels from exactly where they are instead of snapping back first.
 */
export function lerpView(t: number, cityView: CameraView = CITY_VIEW): CameraView {
  const eased = easeInOutCubic(t);

  let thetaDelta = cityView.theta - FLAT_VIEW.theta;
  if (thetaDelta > Math.PI) thetaDelta -= Math.PI * 2;
  if (thetaDelta < -Math.PI) thetaDelta += Math.PI * 2;

  return {
    phi: lerp(FLAT_VIEW.phi, cityView.phi, eased),
    theta: FLAT_VIEW.theta + thetaDelta * eased,
  };
}

/** Inverse of sphericalToCartesian — recovers the angles the user has
 * orbited to, so the rig can adopt them as the tilted view. */
export function cartesianToSpherical(
  x: number,
  y: number,
  z: number,
): CameraView {
  const radius = Math.hypot(x, y, z);
  if (radius === 0) return { ...CITY_VIEW };
  return {
    phi: Math.acos(Math.min(1, Math.max(-1, y / radius))),
    theta: Math.atan2(x, z),
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

type Vec3 = { x: number; y: number; z: number };

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/**
 * The camera's screen-space axes for a view, looking at the origin with
 * world +Y as up. Screen-right and screen-up let us project the scene's
 * bounding box without involving Three.
 */
export function viewBasis(view: CameraView): { right: Vec3; up: Vec3 } {
  const position = sphericalToCartesian(view.phi, view.theta, 1);
  const forward = normalize(subtract({ x: 0, y: 0, z: 0 }, position));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  return { right, up: cross(right, forward) };
}

/**
 * Screen-space extent of the city's bounding box at a given view, in
 * world units. Projects all eight corners rather than guessing, so the
 * fit stays correct as the camera tilts and the buildings' height starts
 * contributing to the vertical extent.
 */
export function projectedExtent(
  gridWidth: number,
  gridDepth: number,
  maxHeight: number,
  view: CameraView,
): { width: number; height: number } {
  const { right, up } = viewBasis(view);
  const halfWidth = gridWidth / 2;
  const halfDepth = gridDepth / 2;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const x of [-halfWidth, halfWidth]) {
    for (const y of [0, maxHeight]) {
      for (const z of [-halfDepth, halfDepth]) {
        const corner = { x, y, z };
        const screenX = dot(corner, right);
        const screenY = dot(corner, up);
        minX = Math.min(minX, screenX);
        maxX = Math.max(maxX, screenX);
        minY = Math.min(minY, screenY);
        maxY = Math.max(maxY, screenY);
      }
    }
  }

  return { width: maxX - minX, height: maxY - minY };
}

/**
 * Orthographic zoom that frames the city at a given view.
 *
 * Fitting the real projected bounds — rather than the flat footprint
 * times a fixed fudge factor — keeps the city filling the canvas
 * throughout the transform. Rotating the grid actually *shrinks* its
 * projected width, so a fixed scale factor compounded with that left the
 * city marooned in the middle of the canvas.
 */
export function fitZoomForView(
  canvasWidth: number,
  canvasHeight: number,
  gridWidth: number,
  gridDepth: number,
  maxHeight: number,
  view: CameraView,
  // Fraction of the canvas the city fills. The margin clears the month
  // labels above the grid and the weekday labels to its left, and keeps
  // the city clear of the controls overlaying the viewport. Callers pass
  // the tunable value from SceneConfig; this is only the fallback.
  padding = 0.6,
): number {
  if (gridWidth <= 0 || gridDepth <= 0) return 1;
  if (canvasWidth <= 0 || canvasHeight <= 0) return 1;

  const extent = projectedExtent(gridWidth, gridDepth, maxHeight, view);
  if (extent.width <= 0 || extent.height <= 0) return 1;

  return Math.min(
    (canvasWidth * padding) / extent.width,
    (canvasHeight * padding) / extent.height,
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
