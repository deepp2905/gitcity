"use client";

import { useCallback, useState } from "react";

export type ElementSize = { width: number; height: number };

/**
 * Measures an element with a ResizeObserver. Returns a callback ref so
 * measurement starts the moment the node mounts, with no effect needed.
 */
export function useElementSize(): [
  (node: HTMLElement | null) => void,
  ElementSize,
] {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;

    // Measure immediately rather than waiting for the observer's first
    // callback. ResizeObserver delivers during the rendering steps, which
    // are suspended while the page isn't compositing (a background tab,
    // a hidden pane), so anything gated on a non-zero size would never
    // mount there. This also saves a wasted render pass in the normal
    // case.
    const initial = node.getBoundingClientRect();
    setSize((previous) =>
      previous.width === initial.width && previous.height === initial.height
        ? previous
        : { width: initial.width, height: initial.height },
    );

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}
