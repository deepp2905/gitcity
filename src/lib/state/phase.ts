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

  // A failed search keeps whatever city is already up rather than
  // dropping back to the mock, so the error reads as "that one didn't
  // work" instead of wiping the screen.
  if (hasError) return loadedLogin ? "ready" : "idle";

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
