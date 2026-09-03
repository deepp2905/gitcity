"use client";

import { useEffect } from "react";
import Clarity from "@microsoft/clarity";

/**
 * Starts Microsoft Clarity.
 *
 * The official package rather than the pasted snippet. Both end up
 * injecting the same tag, but this one either ran or it did not, which
 * is worth something: the hand-placed versions were hard to tell apart
 * from a working one. `next/script` was worse — `afterInteractive` emits
 * no markup at all (the tag ships inside the React flight payload and is
 * injected during hydration) and `beforeInteractive` emits only a
 * `<link rel="preload">`, which fetches without running.
 *
 * A client component because `init` touches `document`. Renders nothing.
 */
/** Public by design: the tag ships to every visitor, so there is nothing
 * here to keep out of the repo. Kept beside the call rather than passed
 * from the layout — it is a constant, not configuration, and as a prop
 * it made a round trip through the server payload for no reason. */
const CLARITY_PROJECT_ID = "ya563wbgwm";

let started = false;

export function Analytics() {
  useEffect(() => {
    // Guarded rather than trusting the effect to run once. React's strict
    // mode fires effects twice in development, and a second init would
    // load the tag again.
    if (started) return;
    started = true;
    Clarity.init(CLARITY_PROJECT_ID);
  }, []);

  return null;
}
