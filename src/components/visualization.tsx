"use client";

import dynamic from "next/dynamic";
import type { ContributionPeriod, GithubProfile } from "@/lib/contributions/types";
import type { ViewMode } from "@/lib/state/view";
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
    loading: () => null,
  },
);

type VisualizationProps = {
  period: ContributionPeriod;
  profile: GithubProfile;
  view: ViewMode;
  /** 0 = flat, 1 = tilted. Follows the phase, not the URL alone. */
  target: number;
  waving: boolean;
  interactive: boolean;
  webglSupported: boolean;
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
  target,
  waving,
  interactive,
  webglSupported,
  onToggleView,
}: VisualizationProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  if (!webglSupported) {
    return (
      <div className="flex flex-col gap-4">
        <Heatmap period={period} login={profile.login} />
        <p className="mx-auto max-w-md text-center text-xs text-ink-muted">
          The 3D city needs WebGL, which this browser doesn&apos;t support. The
          heatmap above shows exactly the same contribution data.
        </p>
      </div>
    );
  }

  return (
    <>
      <CityScene
        period={period}
        login={profile.login}
        target={target}
        waving={waving}
        interactive={interactive}
        reducedMotion={reducedMotion}
        isMobile={isMobile}
        onToggleView={onToggleView}
        view={view}
      />

      {/* Same information, always available to assistive technology. */}
      <Heatmap period={period} login={profile.login} visuallyHidden />
    </>
  );
}
