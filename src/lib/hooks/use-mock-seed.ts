"use client";

import { useSyncExternalStore } from "react";
import { MOCK_SEED, randomMockSeed } from "@/lib/contributions/mock";

/**
 * One seed per page load, drawn on the client.
 *
 * Module scope rather than component state, so the seed survives a
 * remount: the idle city should be a different one each visit, not each
 * time React happens to rebuild the tree.
 */
let sessionSeed: number | null = null;

function getSessionSeed(): number {
  sessionSeed ??= randomMockSeed();
  return sessionSeed;
}

/** Nothing ever changes the seed, so there is nothing to subscribe to. */
function subscribe(): () => void {
  return () => {};
}

/**
 * The seed for the idle city.
 *
 * `useSyncExternalStore` rather than an effect, because that is exactly
 * what it is for: a value that legitimately differs between the server
 * and the client. The server snapshot is the fixed seed, so the markup
 * both sides produce matches and hydration succeeds; React then re-reads
 * the client snapshot and the random city takes over.
 *
 * Doing this as `setState` in an effect would be the same two renders
 * with none of the guarantees, and React's lint rules reject it.
 */
export function useMockSeed(): number {
  return useSyncExternalStore(subscribe, getSessionSeed, () => MOCK_SEED);
}
