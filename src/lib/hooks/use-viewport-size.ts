"use client";

import { useSyncExternalStore } from "react";

export type ViewportSize = { width: number; height: number };

const SERVER_SIZE: ViewportSize = { width: 0, height: 0 };

let cached: ViewportSize = SERVER_SIZE;

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", onChange);
  window.addEventListener("orientationchange", onChange);
  return () => {
    window.removeEventListener("resize", onChange);
    window.removeEventListener("orientationchange", onChange);
  };
}

function getSnapshot(): ViewportSize {
  // useSyncExternalStore compares snapshots by identity, so a fresh object
  // every call would loop forever. Only allocate when the size changed.
  if (cached.width !== window.innerWidth || cached.height !== window.innerHeight) {
    cached = { width: window.innerWidth, height: window.innerHeight };
  }
  return cached;
}

/**
 * The viewport's size, read directly rather than measured off an element.
 *
 * The scene fills the viewport, so there is nothing to measure. Reading
 * window dimensions is also synchronous and always correct, where a
 * ResizeObserver delivers during the rendering steps and stays silent
 * while the page isn't compositing (a background tab, a hidden pane),
 * leaving anything gated on a measured size stuck at zero.
 */
export function useViewportSize(): ViewportSize {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SIZE);
}
