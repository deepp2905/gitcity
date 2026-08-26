"use client";

import { useSyncExternalStore } from "react";
import { detectWebGLSupport } from "@/lib/three/webgl";

/** Probed once per page load; the answer cannot change under us. */
let cached: boolean | null = null;

const subscribe = () => () => {};

/**
 * WebGL availability. Returns true during SSR so the server and first
 * client render agree; the real answer arrives on the client.
 */
export function useWebGLSupport(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      cached ??= detectWebGLSupport();
      return cached;
    },
    () => true,
  );
}
