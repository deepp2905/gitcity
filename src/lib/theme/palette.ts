import { hexToRgb, lerpOklch, oklchToRgb, rgbToHex, rgbToOklch } from "./color";

/**
 * gitCity color palette.
 *
 * This is the single JS/TS source of truth for colors the 3D scene needs as
 * real hex values (Three.js materials can't read CSS custom properties).
 * The values here MUST match src/app/globals.css 1:1 — if you change one,
 * change the other.
 */

/**
 * Off-white canvas, near-black ink, and greens reserved entirely for the
 * contribution levels. There is deliberately no accent colour: anything
 * that is not data — controls, focus rings, chrome — is a neutral, so the
 * only saturated thing on screen is the city.
 *
 * Light-only theme.
 */
export const palette = {
  canvas: "#faf8f3",
  canvasRaised: "#ffffff",
  border: "#e5e1d8",

  ink: "#171412",
  inkMuted: "#6b6459",
  inkSubtle: "#948c7e",

  danger: "#b5432a",
  dangerBg: "#fbeee9",

  /** Padding tiles for days a year hasn't reached yet — lighter than a
   * zero-contribution tile, so an unlived day reads as an empty lot
   * rather than an idle one. */
  futureTile: "#f2efe8",
} as const;

/**
 * Contribution heatmap / building levels, low → high. Index 0 is the
 * "no contributions" ground-tile color; indices 1-4 mirror GitHub's
 * FIRST_QUARTILE..FOURTH_QUARTILE quartiles.
 */
export const levelColors = [
  "#ebe8e0", // level 0 — ground / no contributions
  "#9be9a8", // FIRST_QUARTILE
  "#40c463", // SECOND_QUARTILE
  "#30a14e", // THIRD_QUARTILE
  "#216e39", // FOURTH_QUARTILE
] as const;

export type ContributionLevel =
  | "NONE"
  | "FIRST_QUARTILE"
  | "SECOND_QUARTILE"
  | "THIRD_QUARTILE"
  | "FOURTH_QUARTILE";

export const levelColorByName: Record<ContributionLevel, string> = {
  NONE: levelColors[0],
  FIRST_QUARTILE: levelColors[1],
  SECOND_QUARTILE: levelColors[2],
  THIRD_QUARTILE: levelColors[3],
  FOURTH_QUARTILE: levelColors[4],
};

/**
 * Continuous ramp endpoints for the 3D city, converted to OKLCH once at
 * module load. The 2D heatmap keeps GitHub's five discrete buckets for
 * familiarity; the city interpolates between these two so a 1-commit day
 * and an 18-commit day are visibly different rather than sharing a color.
 */
const RAMP_START_HEX = levelColors[1]; // lightest active green
const RAMP_END_HEX = levelColors[4]; // deepest green

const rampStart = rgbToOklch(hexToRgb(RAMP_START_HEX));
const rampEnd = rgbToOklch(hexToRgb(RAMP_END_HEX));

/**
 * Color for a day, from the same 0..1 sqrt-normalized value that drives
 * building height. Zero-contribution days keep the neutral ground color
 * rather than entering the ramp.
 */
export function contributionRampColor(
  normalized: number,
  hasContributions: boolean,
): string {
  if (!hasContributions) return levelColors[0];
  return rgbToHex(oklchToRgb(lerpOklch(rampStart, rampEnd, normalized)));
}

/**
 * The steps the loading wave rotates through.
 *
 * Sampled from the contribution ramp rather than taken from
 * `levelColors`. GitHub's five swatches do not sit on a straight line:
 * they bow outward in chroma, peaking at 0.178 for `#40c463`, where the
 * ramp runs flat at ~0.112-0.119 from end to end. Stepping through them
 * put colours on screen 50% more saturated than anything the city itself
 * can render — and with ambient 1.6 plus directional 2, the extra chroma
 * is what clips first, so those steps read as neon while the same
 * lighting leaves the ramp alone.
 *
 * Level 0 still leads: the neutral ground colour, so the wave travels the
 * full distance from an empty city to a full one. The four above it are
 * the city's own greens.
 */
const WAVE_LEVELS = [
  levelColors[0],
  contributionRampColor(0, true),
  contributionRampColor(1 / 3, true),
  contributionRampColor(2 / 3, true),
  contributionRampColor(1, true),
] as const;

/**
 * Colour for the loading wave, which runs only in the flat state.
 *
 * Snaps between the steps rather than interpolating. The contribution
 * ramp is continuous because it encodes a magnitude — a 3-commit day and
 * a 12-commit day should not share a swatch. The wave encodes nothing, so
 * stepping suits it, and the steps are drawn from the same ramp so the
 * loading state and the city speak in one palette.
 */
export function waveLevelColor(amount: number): string {
  const clamped = amount > 0 ? (amount < 1 ? amount : 1) : 0;
  const index = Math.min(
    WAVE_LEVELS.length - 1,
    Math.floor(clamped * WAVE_LEVELS.length),
  );
  return WAVE_LEVELS[index];
}

/** Exposed for tests: the wave must only ever show one of these. */
export const waveLevels: readonly string[] = WAVE_LEVELS;
