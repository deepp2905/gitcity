"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";
import type { ViewMode } from "@/lib/state/url-state";
import { detectWebGLSupport } from "@/lib/three/webgl";
import {
  useIsMobile,
  usePrefersReducedMotion,
} from "@/lib/hooks/use-media-query";
import { Heatmap } from "./heatmap";

// Three.js must never run on the server, and code-splitting it keeps the
// renderer out of the initial bundle.
const CityScene = dynamic(
  () => import("./three/city-scene").then((m) => m.CityScene),
  {
    ssr: false,
    loading: () => (
      <div className="h-[320px] w-full animate-pulse rounded-xl border border-border bg-canvas sm:h-[420px]" />
    ),
  },
);

let cachedWebGL: boolean | null = null;

/** WebGL support, probed once on the client. */
function useWebGLSupport(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => {
      cachedWebGL ??= detectWebGLSupport();
      return cachedWebGL;
    },
    () => true, // assume supported during SSR; the client decides
  );
}

type VisualizationProps = {
  period: ContributionPeriod;
  profile: GithubProfile;
  view: ViewMode;
  onToggleView: (next: ViewMode) => void;
};

/**
 * There is only ever one visualization: the 3D scene. The "2D" state is
 * that same scene viewed from directly overhead, so the toggle changes
 * the camera rather than swapping renderings.
 *
 * The DOM heatmap stays mounted underneath in both states — visually
 * hidden when WebGL works (screen readers and keyboard users still get
 * every day's exact date and count), and shown as the full fallback when
 * it doesn't.
 */
export function Visualization({
  period,
  profile,
  view,
  onToggleView,
}: VisualizationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const webglSupported = useWebGLSupport();

  const isCity = view === "3d";

  if (!webglSupported) {
    return (
      <div className="flex flex-col gap-4">
        <Heatmap period={period} login={profile.login} />
        <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink-muted">
          The 3D city needs WebGL, which this browser doesn&apos;t support. The
          heatmap above shows exactly the same contribution data.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CityScene
        period={period}
        target={isCity ? 1 : 0}
        reducedMotion={reducedMotion}
        isMobile={isMobile}
      />

      {/* Same information, always available to assistive technology. */}
      <Heatmap period={period} login={profile.login} visuallyHidden />

      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => onToggleView(isCity ? "2d" : "3d")}
          className="min-h-11 rounded-lg border border-border bg-canvas-raised px-5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isCity ? "Flatten to 2D" : "Transform to 3D"}
        </button>
      </div>
    </div>
  );
}
