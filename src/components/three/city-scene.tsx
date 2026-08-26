"use client";

import { useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { ContributionDay, ContributionPeriod } from "@/lib/contributions/types";
import { formatDayLabel } from "@/lib/contributions/grid";
import {
  buildSceneTiles,
  sceneWeekCount,
} from "@/lib/contributions/scene-tiles";
import { emptyPeriodMessage } from "@/lib/contributions/empty-message";
import { SCENE_MAX_HEIGHT, gridDepth, gridWidth } from "@/lib/three/layout";
import { FLAT_VIEW, fitZoomForView } from "@/lib/three/camera";
import { pixelRatioCap } from "@/lib/three/webgl";
import { palette } from "@/lib/theme/palette";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { CityBuildings } from "./city-buildings";
import { CameraRig } from "./camera-rig";
import { GridLabels } from "./grid-labels";
import { FpsMeter } from "./fps-meter";

type CitySceneProps = {
  period: ContributionPeriod;
  /** 0 = flat grid, 1 = tilted city. */
  target: number;
  reducedMotion: boolean;
  isMobile: boolean;
};

type Tooltip = { day: ContributionDay; x: number; y: number };

/**
 * One scene for both states. The camera never switches projection — it's
 * orthographic throughout — so the flat view is genuinely the same city
 * seen from directly above, not a separate 2D rendering.
 */
export function CityScene({
  period,
  target,
  reducedMotion,
  isMobile,
}: CitySceneProps) {
  const [containerRef, size] = useElementSize();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  /** Written every frame by the rig, read every frame by the buildings —
   * deliberately a ref so the transform never re-renders React. */
  const progressRef = useRef(target);

  /** Sparse mirror of progress, only to fade the DOM label overlay. */
  const [labelProgress, setLabelProgress] = useState(target);

  // Tiles, not raw days: a year still in progress is padded out to its
  // full calendar year so every year keeps the same footprint.
  const tiles = buildSceneTiles(period);
  const weekCount = sceneWeekCount(tiles);

  // A blank grid with no explanation reads as a loading bug.
  const isEmpty = period.totalContributions === 0;
  const emptyMessage = emptyPeriodMessage(period.id);

  const sceneWidth = gridWidth(weekCount);
  const sceneDepth = gridDepth();

  // Zoom at the flat view, used to place the DOM label overlay. The rig
  // recomputes the live zoom each frame from the same function.
  const baseZoom = fitZoomForView(
    size.width,
    size.height,
    sceneWidth,
    sceneDepth,
    0,
    FLAT_VIEW,
  );

  const handleHoverDay = useCallback(
    (day: ContributionDay | null, x: number, y: number) => {
      setTooltip(day ? { day, x, y } : null);
    },
    [],
  );

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="relative h-[320px] w-full overflow-hidden rounded-xl border border-border bg-canvas sm:h-[420px]"
        // Decorative: the sr-only heatmap carries the same information.
        aria-hidden="true"
      >
        {size.width > 0 ? (
          <Canvas
            // "percentage" is PCFShadowMap. R3F's `shadows` boolean picks
            // PCFSoftShadowMap, which three deprecated in r185 and
            // silently downgrades to PCFShadowMap anyway — so this is the
            // same output without the console warning.
            shadows={isMobile ? false : "percentage"}
            // `flat` disables R3F's default ACES Filmic tone mapping.
            // ACES is built for HDR film response: it compresses
            // near-white toward ~85% grey and desaturates, which made the
            // off-white ground read as a grey panel against the page and
            // muted the OKLCH ramp. This is a flat-lit diagram, not a
            // photographic scene, so colors should render as authored.
            flat
            dpr={pixelRatioCap(isMobile)}
            orthographic
            camera={{ position: [0, 200, 8], zoom: baseZoom, near: 1, far: 600 }}
            onPointerMissed={() => setTooltip(null)}
          >
            <color attach="background" args={[palette.canvas]} />

            <ambientLight intensity={1.7} />
            <directionalLight
              position={[30, 50, 20]}
              intensity={1.9}
              castShadow={!isMobile}
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-70}
              shadow-camera-right={70}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
            />

            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.02, 0]}
              receiveShadow={!isMobile}
            >
              <planeGeometry args={[600, 600]} />
              <meshLambertMaterial color={palette.canvas} />
            </mesh>

            <CityBuildings
              tiles={tiles}
              weekCount={weekCount}
              progressRef={progressRef}
              onHoverDay={handleHoverDay}
            />

            <CameraRig
              target={target}
              progressRef={progressRef}
              gridWidth={sceneWidth}
              gridDepth={sceneDepth}
              maxHeight={SCENE_MAX_HEIGHT}
              canvasWidth={size.width}
              canvasHeight={size.height}
              reducedMotion={reducedMotion}
              onProgress={setLabelProgress}
            />
          </Canvas>
        ) : null}

        <GridLabels
          tiles={tiles}
          weekCount={weekCount}
          width={size.width}
          height={size.height}
          zoom={baseZoom}
          progress={labelProgress}
        />

        <FpsMeter />

        {isEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="rounded-xl border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-4 py-3 text-center shadow-[var(--shadow-soft)] backdrop-blur-md">
              <p className="text-sm font-semibold text-ink">
                {emptyMessage.headline}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {emptyMessage.detail}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-xs font-medium tabular-nums text-white shadow-md"
          style={{ left: tooltip.x, top: tooltip.y - 10 }}
        >
          {formatDayLabel(tooltip.day)}
        </div>
      ) : null}
    </div>
  );
}
