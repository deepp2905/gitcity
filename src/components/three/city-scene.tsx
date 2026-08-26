"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { ContributionDay, ContributionPeriod } from "@/lib/contributions/types";
import type { ViewMode } from "@/lib/state/url-state";
import { formatDayLabel } from "@/lib/contributions/grid";
import {
  buildSceneTiles,
  sceneWeekCount,
} from "@/lib/contributions/scene-tiles";
import { emptyPeriodMessage } from "@/lib/contributions/empty-message";
import { gridDepth, gridWidth } from "@/lib/three/layout";
import {
  DEFAULT_SCENE_CONFIG,
  type SceneConfig,
} from "@/lib/three/config";
import {
  CITY_VIEW,
  FLAT_VIEW,
  fitZoomForView,
  type CameraView,
} from "@/lib/three/camera";
import { pixelRatioCap } from "@/lib/three/webgl";
import { palette } from "@/lib/theme/palette";
import { useElementSize } from "@/lib/hooks/use-element-size";
import { CityBuildings } from "./city-buildings";
import { CameraRig } from "./camera-rig";
import { GridLabels } from "./grid-labels";
import { FpsMeter } from "./fps-meter";
import { ShadowCatcher } from "./shadow-catcher";
import { TuningPanel } from "./tuning-panel";

type CitySceneProps = {
  period: ContributionPeriod;
  /** 0 = flat grid, 1 = tilted city. */
  target: number;
  view: ViewMode;
  reducedMotion: boolean;
  isMobile: boolean;
  onToggleView: (next: ViewMode) => void;
};

type Tooltip = { day: ContributionDay; x: number; y: number };

/** Pointer travel beyond this is a drag (orbit), not a click. */
const DRAG_THRESHOLD_PX = 6;

/** Grace period before a tooltip is dismissed, so crossing the gap
 * between two buildings doesn't strobe it. */
const TOOLTIP_DISMISS_DELAY_MS = 120;

/**
 * One scene for both states. The camera never switches projection — it's
 * orthographic throughout — so the flat view is genuinely the same city
 * seen from directly above, not a separate 2D rendering.
 */
export function CityScene({
  period,
  target,
  view,
  reducedMotion,
  isMobile,
  onToggleView,
}: CitySceneProps) {
  const [containerRef, size] = useElementSize();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  /** Written every frame by the rig, read every frame by the buildings —
   * deliberately a ref so the transform never re-renders React. */
  const progressRef = useRef(target);

  /** Sparse mirror of progress, only to fade the DOM label overlay. */
  const [labelProgress, setLabelProgress] = useState(target);

  /** Where the tilted view currently is. Orbiting rewrites this, so
   * flattening later departs from wherever the user left the camera. */
  const cityViewRef = useRef<CameraView>({ ...CITY_VIEW });

  /** True once the transform has arrived and the user may orbit. */
  const [orbiting, setOrbiting] = useState(false);

  /** Live scene constants. Only the dev tuning panel ever changes these;
   * in production this stays at its defaults for the session. */
  const [config, setConfig] = useState<SceneConfig>(DEFAULT_SCENE_CONFIG);

  // Flattening resets the angle: the transform always returns to the
  // scripted flat view, so a separate reset control has nothing to do.
  const resetCityView = useCallback(() => {
    cityViewRef.current = { ...CITY_VIEW };
  }, []);

  useEffect(() => {
    if (target === 0) resetCityView();
  }, [target, resetCityView]);

  // Tiles, not raw days: a year still in progress is padded out to its
  // full calendar year so every year keeps the same footprint.
  const tiles = buildSceneTiles(period);
  const weekCount = sceneWeekCount(tiles);

  // A blank grid with no explanation reads as a loading bug.
  const isEmpty = period.totalContributions === 0;
  const emptyMessage = emptyPeriodMessage(period.id);

  const sceneWidth = gridWidth(weekCount, config.cellGap);
  const sceneDepth = gridDepth(config.cellGap);

  // Zoom at the flat view, used to place the DOM label overlay. The rig
  // recomputes the live zoom each frame from the same function.
  const baseZoom = fitZoomForView(
    size.width,
    size.height,
    sceneWidth,
    sceneDepth,
    0,
    FLAT_VIEW,
    config.zoomPadding,
  );

  /**
   * Pending tooltip dismissal.
   *
   * The mesh reports "out" whenever the ray stops hitting a building,
   * which happens every time the pointer crosses one of the gaps between
   * tiles. Clearing immediately made the tooltip strobe as you moved
   * across the grid, so a dismissal is deferred long enough for the next
   * building to claim it.
   */
  const dismissTimerRef = useRef<number | null>(null);

  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const handleHoverDay = useCallback(
    (day: ContributionDay | null, x: number, y: number) => {
      cancelDismiss();
      if (day) {
        setTooltip({ day, x, y });
        return;
      }
      dismissTimerRef.current = window.setTimeout(
        () => setTooltip(null),
        TOOLTIP_DISMISS_DELAY_MS,
      );
    },
    [cancelDismiss],
  );

  /** Leaving the scene entirely dismisses at once, with no grace period. */
  const handlePointerLeave = useCallback(() => {
    cancelDismiss();
    setTooltip(null);
  }, [cancelDismiss]);

  useEffect(() => cancelDismiss, [cancelDismiss]);

  /**
   * Clicking the scene toggles the view, but the same gesture also drives
   * orbit once the city has arrived. Distinguish them by movement: a
   * press that barely moves is a click, anything further is a drag and
   * belongs to OrbitControls.
   */
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    pressRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press) return;

      const travelled = Math.hypot(
        event.clientX - press.x,
        event.clientY - press.y,
      );
      if (travelled > DRAG_THRESHOLD_PX) return;

      onToggleView(view === "3d" ? "2d" : "3d");
    },
    [onToggleView, view],
  );

  return (
    <div className="relative">
      <div
        ref={containerRef}
        // No border, background or radius: the canvas already clears to
        // the page colour, so the scene reads as part of the page rather
        // than a panel sitting on it.
        className="relative h-[380px] w-full cursor-pointer sm:h-[560px]"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        // Decorative, and the toggle button beside the tabs is the
        // accessible equivalent of clicking here.
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
          >
            <color attach="background" args={[palette.canvas]} />

            <ambientLight intensity={config.ambientIntensity} />
            <directionalLight
              position={[config.lightX, config.lightY, config.lightZ]}
              intensity={config.directionalIntensity}
              castShadow={!isMobile}
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-70}
              shadow-camera-right={70}
              shadow-camera-top={50}
              shadow-camera-bottom={-50}
            />

            <ShadowCatcher
              progressRef={progressRef}
              enabled={!isMobile}
              maxOpacity={config.maxShadowOpacity}
            />

            <CityBuildings
              tiles={tiles}
              weekCount={weekCount}
              target={target}
              config={config}
              reducedMotion={reducedMotion}
              onHoverDay={handleHoverDay}
            />

            <CameraRig
              target={target}
              progressRef={progressRef}
              cityViewRef={cityViewRef}
              orbiting={orbiting}
              gridWidth={sceneWidth}
              gridDepth={sceneDepth}
              maxHeight={config.sceneMaxHeight}
              canvasWidth={size.width}
              canvasHeight={size.height}
              durationMs={config.transformDurationMs}
              zoomPadding={config.zoomPadding}
              reducedMotion={reducedMotion}
              onProgress={setLabelProgress}
              onSettled={setOrbiting}
            />

            {/* Guided orbit: only once the city has arrived, and never
                pan, flip under the ground, or zoom out of frame. */}
            <OrbitControls
              enabled={orbiting}
              enablePan={false}
              enableDamping
              dampingFactor={0.08}
              minPolarAngle={Math.PI * 0.08}
              maxPolarAngle={Math.PI * 0.47}
              minZoom={baseZoom * 0.4}
              maxZoom={baseZoom * 4}
            />
          </Canvas>
        ) : null}

        <GridLabels
          tiles={tiles}
          weekCount={weekCount}
          width={size.width}
          height={size.height}
          zoom={baseZoom}
          cellGap={config.cellGap}
          progress={labelProgress}
        />

        <FpsMeter />

        {process.env.NODE_ENV === "development" ? (
          <TuningPanel config={config} onChange={setConfig} />
        ) : null}

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
