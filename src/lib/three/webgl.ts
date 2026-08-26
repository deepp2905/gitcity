/**
 * WebGL availability probe. When this returns false the app keeps the
 * complete 2D experience and explains why 3D is unavailable, rather than
 * mounting a Canvas that would fail.
 */
export function detectWebGLSupport(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    return context !== null;
  } catch {
    // Some browsers throw rather than returning null when WebGL is
    // disabled by policy or blocked for privacy.
    return false;
  }
}

/** Caps device pixel ratio on mobile, per the performance budget. */
export function pixelRatioCap(isMobile: boolean): [number, number] {
  return isMobile ? [1, 1.5] : [1, 2];
}
