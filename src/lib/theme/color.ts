/**
 * OKLCH color interpolation for the contribution ramp.
 *
 * GitHub's five-bucket `contributionLevel` enum throws away almost all
 * the variance in a typical profile — thresholds are set against the
 * period's max, so one big day collapses everything else into the
 * lightest bucket. (A real profile: 78 of 89 active days shared one
 * color while spanning 1 to 18 contributions.)
 *
 * So the 3D city colors continuously from the same sqrt-normalized value
 * that drives height. Interpolating in OKLCH rather than sRGB keeps the
 * ramp perceptually even and saturated — a straight sRGB lerp between
 * these greens passes through muddy grey.
 */

export type Oklch = { l: number; c: number; h: number };
export type Rgb = { r: number; g: number; b: number };

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(clamp01(value) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** sRGB (0..1 per channel) to OKLCH. */
export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  const chroma = Math.hypot(okA, okB);
  // Normalize hue into [0, 360).
  const hue = ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;

  return { l: okL, c: chroma, h: hue };
}

/** OKLCH to sRGB (0..1 per channel), clamped into gamut. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const hueRad = (h * Math.PI) / 180;
  const okA = c * Math.cos(hueRad);
  const okB = c * Math.sin(hueRad);

  const lCubed = Math.pow(l + 0.3963377774 * okA + 0.2158037573 * okB, 3);
  const mCubed = Math.pow(l - 0.1055613458 * okA - 0.0638541728 * okB, 3);
  const sCubed = Math.pow(l - 0.0894841775 * okA - 1.291485548 * okB, 3);

  return {
    r: clamp01(
      linearToSrgb(
        4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
      ),
    ),
    g: clamp01(
      linearToSrgb(
        -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
      ),
    ),
    b: clamp01(
      linearToSrgb(
        -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
      ),
    ),
  };
}

/** Interpolates two OKLCH colors, taking the shorter path around hue. */
export function lerpOklch(from: Oklch, to: Oklch, t: number): Oklch {
  const amount = clamp01(t);

  let hueDelta = to.h - from.h;
  if (hueDelta > 180) hueDelta -= 360;
  if (hueDelta < -180) hueDelta += 360;

  return {
    l: from.l + (to.l - from.l) * amount,
    c: from.c + (to.c - from.c) * amount,
    h: (from.h + hueDelta * amount + 360) % 360,
  };
}
