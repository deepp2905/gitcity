"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  degToRad,
  fitZoomForView,
  radToDeg,
  type CameraView,
} from "@/lib/three/camera";
import { pixelRatioCap } from "@/lib/three/webgl";
import { palette } from "@/lib/theme/palette";
import { useViewportSize } from "@/lib/hooks/use-viewport-size";
import { CityBuildings } from "./city-buildings";
import { CameraRig } from "./camera-rig";
import { GridLabels } from "./grid-labels";
import { FpsMeter } from "./fps-meter";
import { ShadowCatcher } from "./shadow-catcher";
import { TuningPanel } from "./tuning-panel";
import { ParallaxGroup, type Pointer } from "./parallax-group";

type CitySceneProps = {
  period: ContributionPeriod;
  /** Whose city this is. Part of the rise key, so switching account
   * counts as new data even when the period label is unchanged. */
  login: string;
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
  login,
  target,
  view,
  reducedMotion,
  isMobile,
  onToggleView,
}: CitySceneProps) {
  // The scene fills the viewport, so read it directly instead of
  // measuring the container.
  const size = useViewportSize();
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  /** Written every frame by the rig, read every frame by the buildings —
   * deliberately a ref so the transform never re-renders React. */
  const progressRef = useRef(target);

  /** Sparse mirror of progress, only to fade the DOM label overlay. */
  const [labelProgress, setLabelProgress] = useState(target);

  /** Live scene constants. Only the dev tuning panel ever changes these;
   * in production this stays at its defaults for the session. */
  const [config, setConfig] = useState<SceneConfig>(DEFAULT_SCENE_CONFIG);

  // Both ends of the transform come from config rather than constants, so
  // the camera-angle sliders actually drive the scene.
  const flatView = useMemo<CameraView>(
    () => ({ phi: degToRad(config.flatPolarDeg), theta: 0 }),
    [config.flatPolarDeg],
  );
  const configCityView = useMemo<CameraView>(
    () => ({
      phi: degToRad(config.cityPolarDeg),
      theta: degToRad(config.cityAzimuthDeg),
    }),
    [config.cityPolarDeg, config.cityAzimuthDeg],
  );

  /** Where the tilted view currently is. Orbiting rewrites this, so
   * flattening later departs from wherever the user left the camera. */
  const cityViewRef = useRef<CameraView>({ ...configCityView });

  /** Queued placement for the rig to apply while OrbitControls has the
   * camera. Without this, tuning the angles did nothing until a 2D round
   * trip handed control back to the rig. */
  const cameraOverrideRef = useRef<CameraView | null>(null);

  /**
   * The last angles the orbit itself pushed into config.
   *
   * Orbiting updates the sliders, and a slider change moves the camera --
   * so without recognising its own echo, the effect below would queue an
   * override on every frame of a drag and fight the user's mouse.
   */
  const orbitEchoRef = useRef<{ polar: number; azimuth: number } | null>(null);

  const handleOrbit = useCallback((orbited: CameraView) => {
    const polar = Math.round(radToDeg(orbited.phi));
    const azimuth = Math.round(radToDeg(orbited.theta));

    setConfig((previous) => {
      if (
        previous.cityPolarDeg === polar &&
        previous.cityAzimuthDeg === azimuth
      ) {
        return previous;
      }
      orbitEchoRef.current = { polar, azimuth };
      return { ...previous, cityPolarDeg: polar, cityAzimuthDeg: azimuth };
    });
  }, []);

  // Angles changed: go there -- unless the change came from the orbit.
  useEffect(() => {
    cityViewRef.current = { ...configCityView };

    const echo = orbitEchoRef.current;
    if (
      echo &&
      echo.polar === config.cityPolarDeg &&
      echo.azimuth === config.cityAzimuthDeg
    ) {
      orbitEchoRef.current = null;
      return;
    }

    cameraOverrideRef.current = { ...configCityView };
  }, [configCityView, config.cityPolarDeg, config.cityAzimuthDeg]);

  // Framing changed: keep the current angle, but re-fit.
  useEffect(() => {
    cameraOverrideRef.current = { ...cityViewRef.current };
  }, [config.zoomPadding, config.sceneMaxHeight, config.cellGap]);

  /** True once the transform has arrived and the user may orbit. */
  const [orbiting, setOrbiting] = useState(false);

  // Flattening resets the angle: the transform always returns to the
  // scripted flat view, so a separate reset control has nothing to do.
  const resetCityView = useCallback(() => {
    cityViewRef.current = { ...configCityView };
  }, [configCityView]);

  // Only once the flatten has fully arrived. Resetting as soon as a
  // flatten was requested snapped the camera to the default tilted view
  // and animated from there, instead of departing from wherever the user
  // had orbited to.
  useEffect(() => {
    if (target === 0 && labelProgress === 0) resetCityView();
  }, [target, labelProgress, resetCityView]);

  // Tiles, not raw days: a year still in progress is padded out to its
  // full calendar year so every year keeps the same footprint.
  // Memoized deliberately. These feed the buildings' layout memo, and the
  // rig re-renders this component ~100 times during a transform to report
  // progress for the label fade. Rebuilding the array each render made the
  // layout identity change every frame, which re-ran the effect that
  // reallocates the spring state and zeroed every velocity mid-rise, so
  // the buildings could not move until the camera settled.
  const tiles = useMemo(() => buildSceneTiles(period), [period]);
  const weekCount = useMemo(() => sceneWeekCount(tiles), [tiles]);

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
    flatView,
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

  /**
   * Pointer position over the viewport, normalized to -1..1 per axis, for
   * the hover lean. A ref rather than state: this updates on every mouse
   * move and must not re-render React.
   */
  const pointerRef = useRef<Pointer>({ x: 0, y: 0 });

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      pointerRef.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    // On the window, not the canvas: the lean should answer the pointer
    // anywhere on the page, including over the controls.
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, []);

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
    // Fixed to the viewport and behind everything: the city is the page's
    // backdrop, and the controls sit above it on their own stacking
    // level. Pointer events stay on so the scene remains clickable and
    // hoverable through the gaps between controls.
    <>
      {/* The city itself: a fixed backdrop behind the page. Its own
          stacking context, so overlays below are siblings rather than
          children or they would be trapped beneath the page content. */}
      <div className="fixed inset-0 z-0">
      <div
        // No border, background or radius: the canvas already clears to
        // the page colour, so the scene reads as part of the page rather
        // than a panel sitting on it.
        // pointer-events must be re-enabled explicitly: the page wrapper
        // disables them so the scene shows through the gaps between
        // controls, and pointer-events inherits.
        className="pointer-events-auto relative h-full w-full cursor-pointer"
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

            <ParallaxGroup
              pointerRef={pointerRef}
              progressRef={progressRef}
              strengthDeg={config.hoverTiltDeg}
              tipRatio={config.hoverTipRatio}
              reducedMotion={reducedMotion}
            >
              <CityBuildings
                tiles={tiles}
                weekCount={weekCount}
                target={target}
                progressRef={progressRef}
              // Account as well as period: switching user while staying
              // on the same tab is still an entirely new dataset.
                riseKey={`${login}:${period.id}`}
                config={config}
                reducedMotion={reducedMotion}
                onHoverDay={handleHoverDay}
              />
            </ParallaxGroup>

            <CameraRig
              target={target}
              progressRef={progressRef}
              cityViewRef={cityViewRef}
              flatView={flatView}
              cameraOverrideRef={cameraOverrideRef}
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
              onOrbit={handleOrbit}
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
      </div>

      {/* Outside the backdrop above: its stacking context would trap these
          overlays below the page content. */}
      {config.showFps ? <FpsMeter /> : null}

      {process.env.NODE_ENV === "development" ? (
        <TuningPanel config={config} onChange={setConfig} />
      ) : null}

      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-xs font-medium tabular-nums text-white shadow-md"
          style={{ left: tooltip.x, top: tooltip.y - 10 }}
        >
          {formatDayLabel(tooltip.day)}
        </div>
      ) : null}
    </>
  );
}
