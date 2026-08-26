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

// Three.js must never run on the server, and keeping it out of the main
// bundle means the 2D experience loads without paying for the renderer.
const CityScene = dynamic(
  () => import("./three/city-scene").then((m) => m.CityScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-border bg-canvas text-sm text-ink-muted sm:h-[520px]">
        Preparing the city…
      </div>
    ),
  },
);

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
let cachedWebGL: boolean | null = null;

type VisualizationProps = {
  period: ContributionPeriod;
  profile: GithubProfile;
  view: ViewMode;
  onToggleView: (next: ViewMode) => void;
};

export function Visualization({
  period,
  profile,
  view,
  onToggleView,
}: VisualizationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const webglSupported = useWebGLSupport();

  const is3D = view === "3d" && webglSupported;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink-muted">
          {is3D ? "City view" : "Heatmap"}
        </h2>

        {webglSupported ? (
          <button
            type="button"
            onClick={() => onToggleView(is3D ? "2d" : "3d")}
            className="min-h-11 rounded-lg border border-border bg-canvas-raised px-4 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {is3D ? "Flatten" : "Build city"}
          </button>
        ) : null}
      </div>

      {/* The accessible grid stays mounted in both modes — visually hidden
          in 3D so screen readers keep the same per-day information. */}
      <Heatmap
        period={period}
        login={profile.login}
        visuallyHidden={is3D}
      />

      {is3D ? (
        <CityScene
          period={period}
          reducedMotion={reducedMotion}
          isMobile={isMobile}
        />
      ) : null}

      {!webglSupported ? (
        <p className="rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-ink-muted">
          3D city view is unavailable because your browser doesn&apos;t support
          WebGL. The heatmap above shows the same contribution data.
        </p>
      ) : null}
    </div>
  );
}
