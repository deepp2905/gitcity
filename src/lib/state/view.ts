/**
 * Whether the city is standing or flat.
 *
 * Plain client state, deliberately not in the URL. Tapping the scene is
 * the primary interaction and fires repeatedly, so routing each toggle
 * through the router to flip one boolean was work for nothing. A shared
 * `?view=` never round-tripped anyway: a loaded city rises on its own,
 * so the link could not reproduce the flat state it named.
 */
export type ViewMode = "2d" | "3d";

/** Every search lands flat. The rise is what makes the transform read. */
export const DEFAULT_VIEW: ViewMode = "2d";
