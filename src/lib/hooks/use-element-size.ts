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
