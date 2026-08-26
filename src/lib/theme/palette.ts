import { hexToRgb, lerpOklch, oklchToRgb, rgbToHex, rgbToOklch } from "./color";

/**
 * Contribution City color palette.
 *
 * This is the single JS/TS source of truth for colors the 3D scene needs as
 * real hex values (Three.js materials can't read CSS custom properties).
 * The values here MUST match src/app/globals.css 1:1 — if you change one,
 * change the other.
 */

/** Off-white canvas, near-black ink, GitHub-inspired greens. Light-only theme. */
export const palette = {
  canvas: "#faf8f3",
  canvasRaised: "#ffffff",
  border: "#e5e1d8",

  ink: "#171412",
  inkMuted: "#6b6459",
  inkSubtle: "#948c7e",

  accent: "#216e39",
  accentStrong: "#196c2e",

  danger: "#b5432a",
  dangerBg: "#fbeee9",
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
