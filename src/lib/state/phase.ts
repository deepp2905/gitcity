/**
 * The single-page microsite has one visualization and three phases. There
 * is deliberately no separate landing view: the same chart is on screen
 * throughout, and only what it shows and how it behaves changes.
 */
export type Phase =
  /** Nobody has searched. A mock city, tilted, hover only, taps ignored. */
  | "idle"
  /** A search is in flight. Flat, running the wave. */
  | "loading"
  /** Real data. Rises on its own, then taps toggle the view. */
  | "ready";

export type PhaseInput = {
  /** Username from the URL, or null. */
  user: string | null;
  /** Login of the data currently held, or null. */
  loadedLogin: string | null;
  /** Whether the minimum loading time has passed for this request. */
  minElapsed: boolean;
  /** Whether the current request settled as an error. */
  hasError: boolean;
};

export function resolvePhase({
  user,
  loadedLogin,
  minElapsed,
  hasError,
}: PhaseInput): Phase {
  if (!user) return "idle";

  // A failed search returns to idle, whatever was loaded before.
  //
  // This used to resolve to "ready" when any earlier city was in memory,
  // so that a failure left it standing rather than wiping the screen.
  // That stopped being sensible once the field hands over to the
  // controls in the ready phase: searching a name that does not exist
  // resurrected the *previous* user's city, swapped the field out for
  // their controls, and left the error pointing at a name nothing on
  // screen belonged to — with no field left to try again in.
  if (hasError) return "idle";

  const dataMatchesUser =
    loadedLogin !== null && loadedLogin.toLowerCase() === user.toLowerCase();

  // Both conditions, so a cached or fixture response that returns in
  // ~20ms still shows the wave rather than flashing past it.
  return dataMatchesUser && minElapsed ? "ready" : "loading";
}

/** Taps only transform once there is real data to transform. */
export function isInteractive(phase: Phase): boolean {
  return phase === "ready";
}

/**
 * Bounds on how long the loading wave runs before real data is allowed
 * on screen.
 *
 * A cached or fixture response can answer in ~20ms, so without a floor
 * the wave flashes past unseen. The floor is randomized within this range
 * rather than fixed because a live GitHub round trip never takes the same
 * time twice, and a constant delay reads as a scripted pause.
 */
export const LOADING_FLOOR_MIN_MS = 1500;
export const LOADING_FLOOR_MAX_MS = 2500;

/** A floor for one request, in `[LOADING_FLOOR_MIN_MS, LOADING_FLOOR_MAX_MS]`. */
export function pickLoadingFloorMs(random: () => number = Math.random): number {
  const span = LOADING_FLOOR_MAX_MS - LOADING_FLOOR_MIN_MS;
  return LOADING_FLOOR_MIN_MS + random() * span;
}
