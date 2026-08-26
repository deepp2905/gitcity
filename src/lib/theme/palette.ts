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
