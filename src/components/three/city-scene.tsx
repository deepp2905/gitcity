"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Canvas } from "@react-three/fiber";
import {
  EXPORT_LOGICAL_HEIGHT,
  EXPORT_LOGICAL_WIDTH,
  EXPORT_PIXEL_RATIO,
  EXPORT_ZOOM_PADDING,
} from "@/lib/export/png";
import type { ContributionPeriod } from "@/lib/contributions/types";
import type { ViewMode } from "@/lib/state/view";
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
  lerpView,
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

/**
 * Pointer over the viewport, each axis normalized to -1..1.
 *
 * `inside` is separate from position because leaving is not a move: the
 * cursor's last coordinates stay valid, and the swell needs to know to
 * settle rather than to sit frozen where the pointer was abandoned.
 */
export type Pointer = { x: number; y: number; inside: boolean };

type CitySceneProps = {
  period: ContributionPeriod;
  /** Whose city this is. Part of the rise key, so switching account
   * counts as new data even when the period label is unchanged. */
  login: string;
  /** 0 = flat grid, 1 = tilted city. */
  target: number;
  view: ViewMode;
  /** Running the loading wave rather than showing data. */
  waving: boolean;
  /** Taps transform the view. False until there is real data. */
  interactive: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
  onToggleView: (next: ViewMode) => void;
  /**
   * Filled in with a function that snapshots the scene, so the download
   * button — which lives with the page chrome, not in here — can reach
   * the renderer without this component knowing what it is for.
   */
  captureRef?: RefObject<(() => HTMLCanvasElement | null) | null>;
};

/**
 * Pointer travel beyond this is a drag, not a tap. A finger wanders far
 * more than a mouse over the same intent, so touch gets a wider allowance
 * or deliberate taps get silently swallowed.
 */
const DRAG_THRESHOLD_PX = 6;
const TOUCH_DRAG_THRESHOLD_PX = 14;

/**
 * Horizontal room reserved for the weekday labels, which sit in a gutter
 * to the left of the grid. Counted on both sides because the city is
 * centred: taking it off one side only would shift the city instead of
 * making room. Without this the labels are pushed off a phone screen as
 * soon as the city is allowed to fill the width.
 */
const WEEKDAY_GUTTER_PX = 34;

/**
 * Minimal shape of what the capture needs from the renderer.
 *
 * Structural rather than `THREE.WebGLRenderer`: two copies of
 * @types/three are installed — 0.182.0 to match the pinned three, and
 * 0.185.4 pulled in by React Three Fiber — and the two WebGLRenderer
 * types are not assignable to one another. Scene and camera stay generic
 * so they pass through untouched from whichever version supplied them.
 */
type CaptureRenderer<Scene, Camera> = {
  domElement: HTMLCanvasElement;
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
};

/** The orthographic frustum, which the export reframes and restores. */
type CaptureCamera = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
  updateProjectionMatrix(): void;
};

/** Same version-skew problem as above, so this narrows on three's own
 * runtime discriminator rather than on a type. */
function asOrthographic(camera: unknown): CaptureCamera | null {
  const candidate = camera as
    | (CaptureCamera & { isOrthographicCamera?: boolean })
    | null;
  return candidate?.isOrthographicCamera ? candidate : null;
}

type CaptureFraming = {
  /** Logical size of the export frame; the frustum is in these units. */
  width: number;
  height: number;
  pixelRatio: number;
  /** Pixels per world unit that fits the city in that frame. */
  zoom: number;
};

/**
 * Snapshots the scene into the export's own frame.
 *
 * Four things make this fiddly enough to want explaining:
 *
 * The drawing buffer is cleared after each frame — R3F does not set
 * `preserveDrawingBuffer`, and turning it on would cost a copy on every
 * frame forever to serve a button most people never press. So the scene
 * is re-rendered here and read in the same tick, before the compositor
 * gets a chance to clear it.
 *
 * The read has to be synchronous for the same reason, which is why the
 * pixels are copied into a 2D canvas with `drawImage` rather than handed
 * out as a promise from `toBlob`.
 *
 * The frame is not the viewport's. An orthographic frustum is just a
 * rectangle in pixels, so pointing it at the export's logical size and
 * sizing the buffer to match renders a portrait image from a landscape
 * window. Only the frustum and zoom change; the camera keeps the position
 * and rotation the rig gave it this frame, so the PNG is the angle that
 * is on screen.
 *
 * `setSize` is told not to touch the element's style, and everything is
 * restored in a finally before returning, so the live view is never
 * painted at the export's size or shape.
 */
function captureSceneCanvas<Scene, Camera>(
  gl: CaptureRenderer<Scene, Camera>,
  scene: Scene,
  camera: Camera,
  framing: CaptureFraming,
): HTMLCanvasElement | null {
  const source = gl.domElement;
  const cssWidth = source.clientWidth;
  const cssHeight = source.clientHeight;
  if (cssWidth === 0 || cssHeight === 0) return null;

  const ortho = asOrthographic(camera);
  if (!ortho) return null;

  const previousRatio = gl.getPixelRatio();
  const previous = {
    left: ortho.left,
    right: ortho.right,
    top: ortho.top,
    bottom: ortho.bottom,
    zoom: ortho.zoom,
  };

  try {
    gl.setPixelRatio(framing.pixelRatio);
    gl.setSize(framing.width, framing.height, false);

    ortho.left = framing.width / -2;
    ortho.right = framing.width / 2;
    ortho.top = framing.height / 2;
    ortho.bottom = framing.height / -2;
    ortho.zoom = framing.zoom;
    ortho.updateProjectionMatrix();

    gl.render(scene, camera);

    const snapshot = document.createElement("canvas");
    snapshot.width = source.width;
    snapshot.height = source.height;
    snapshot.getContext("2d")?.drawImage(source, 0, 0);
    return snapshot;
  } finally {
    // Restored whatever happened above, or the live view would keep the
    // export's shape until the next resize. The rig rewrites zoom and
    // the frustum next frame anyway; this is so the frame in between is
    // right too.
    ortho.left = previous.left;
    ortho.right = previous.right;
    ortho.top = previous.top;
    ortho.bottom = previous.bottom;
    ortho.zoom = previous.zoom;
    ortho.updateProjectionMatrix();

    gl.setPixelRatio(previousRatio);
    gl.setSize(cssWidth, cssHeight, false);
    gl.render(scene, camera);
  }
}

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
  waving,
  interactive,
  reducedMotion,
  isMobile,
  onToggleView,
  captureRef,
}: CitySceneProps) {
  // The scene fills the viewport, so read it directly instead of
  // measuring the container.
  const size = useViewportSize();

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

  /**
   * The city is width-constrained in portrait -- 53 columns across a
   * phone -- so the desktop margin, which exists to keep it clear of
   * chrome that sits left and right on a wide screen, leaves it
   * postage-stamp sized. On a phone the chrome is above and below
   * instead, and the width is the scarce dimension.
   */
  const effectiveZoomPadding = isMobile
    ? Math.min(0.95, config.zoomPadding * 1.55)
    : config.zoomPadding;

  /** Width the city may actually occupy, once the label gutter is set
   * aside. */
  const fitWidth = Math.max(1, size.width - WEEKDAY_GUTTER_PX * 2);

  // Zoom at the flat view, used to place the DOM label overlay. The rig
  // recomputes the live zoom each frame from the same function.
  const baseZoom = fitZoomForView(
    fitWidth,
    size.height,
    sceneWidth,
    sceneDepth,
    0,
    flatView,
    effectiveZoomPadding,
  );

  /**
   * The R3F root, stashed on creation. Held rather than closed over, so
   * the capture below can be rebuilt every render against the current
   * config without the Canvas being torn down.
   */
  const rootRef = useRef<{
    gl: Parameters<typeof captureSceneCanvas>[0];
    scene: unknown;
    camera: unknown;
  } | null>(null);

  /**
   * Publishes the snapshot function for the download button.
   *
   * No dependency array: the framing depends on the live config, the
   * week count and how far the transform has got, so it is rebound each
   * render rather than capturing a stale closure.
   */
  useEffect(() => {
    if (!captureRef) return;

    captureRef.current = () => {
      const root = rootRef.current;
      if (!root) return null;

      // The angle currently on screen, so the PNG matches what was
      // being looked at rather than a canonical pose.
      const view = lerpView(progressRef.current, configCityView, flatView);

      return captureSceneCanvas(root.gl, root.scene, root.camera, {
        width: EXPORT_LOGICAL_WIDTH,
        height: EXPORT_LOGICAL_HEIGHT,
        pixelRatio: EXPORT_PIXEL_RATIO,
        // Fitted to the export's frame, not the viewport's: a portrait
        // frame fits the city by width, and the on-screen zoom would
        // leave it either cropped or marooned.
        zoom: fitZoomForView(
          EXPORT_LOGICAL_WIDTH,
          EXPORT_LOGICAL_HEIGHT,
          sceneWidth,
          sceneDepth,
          config.sceneMaxHeight * progressRef.current,
          view,
          EXPORT_ZOOM_PADDING,
        ),
      });
    };

    const ref = captureRef;
    return () => {
      ref.current = null;
    };
  });

  /**
   * Clicking the scene toggles the view. Movement still disqualifies a
   * press: a drag across the scene is someone selecting or gesturing, not
   * asking to transform, and toggling under them would be a surprise.
   */
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  /**
   * Pointer position over the viewport, normalized to -1..1 per axis,
   * driving the swell. A ref rather than state: this updates on every
   * mouse move and must not re-render React.
   */
  const pointerRef = useRef<Pointer>({ x: 0, y: 0, inside: false });

  useEffect(() => {
    const track = (event: PointerEvent, inside: boolean) => {
      pointerRef.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
        inside,
      };
    };

    /**
     * A finger drives the swell the same way a cursor does, but only
     * while it is down. There is no hovering touch, so a tap that ended
     * must not leave the bulge sitting where it landed with nothing
     * following to take it away.
     *
     * Nothing else is needed for a moving finger: touch pointers only
     * emit `pointermove` while in contact, so those moves are already
     * scoped to the gesture.
     */
    const handleMove = (event: PointerEvent) => track(event, true);
    const handleDown = (event: PointerEvent) => track(event, true);
    const handleUp = (event: PointerEvent) => {
      // A mouse is still hovering after its button comes up; a finger is
      // gone.
      if (event.pointerType === "mouse" || event.pointerType === "pen") return;
      pointerRef.current = { ...pointerRef.current, inside: false };
    };

    const handleLeave = () => {
      pointerRef.current = { ...pointerRef.current, inside: false };
    };

    // On the window, not the canvas: the swell should answer the pointer
    // anywhere on the page, including over the controls.
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    // Three ways to lose the pointer without a further move. Without
    // these the last known position stays authoritative forever and the
    // swell holds its bulge over an empty screen.
    document.addEventListener("pointerleave", handleLeave);
    document.addEventListener("pointercancel", handleLeave);
    window.addEventListener("blur", handleLeave);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointerleave", handleLeave);
      document.removeEventListener("pointercancel", handleLeave);
      window.removeEventListener("blur", handleLeave);
    };
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
      const threshold =
        event.pointerType === "touch"
          ? TOUCH_DRAG_THRESHOLD_PX
          : DRAG_THRESHOLD_PX;
      if (travelled > threshold) return;

      // The idle city is a demonstration, not a control. It leans toward
      // the pointer but does not answer taps, so nothing appears to be
      // broken when there is no data behind it.
      if (!interactive) return;

      onToggleView(view === "3d" ? "2d" : "3d");
    },
    [interactive, onToggleView, view],
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
        className={`pointer-events-auto relative h-full w-full touch-manipulation ${
          interactive ? "cursor-pointer" : "cursor-default"
        }`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        // Decorative: the scene is a rendering of the heatmap that sits
        // beside it in the accessible tree, which carries every day's
        // date and count in both states.
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
            // The renderer only exists inside the Canvas. Stash it; the
            // capture itself is bound in an effect below, so it reads the
            // current config and framing rather than whatever they were
            // when the Canvas was created.
            onCreated={({ gl, scene, camera }) => {
              rootRef.current = { gl, scene, camera };
            }}
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
                progressRef={progressRef}
              // Account as well as period: switching user while staying
              // on the same tab is still an entirely new dataset.
                riseKey={`${login}:${period.id}`}
                config={config}
                waving={waving}
                // Every city swells, mock or real, under a cursor or a
                // finger. Touch is scoped to the gesture rather than
                // excluded -- see the pointer effect above.
                swellPointerRef={pointerRef}
                reducedMotion={reducedMotion}
              />

            <CameraRig
              target={target}
              progressRef={progressRef}
              flatView={flatView}
              cityView={configCityView}
              gridWidth={sceneWidth}
              gridDepth={sceneDepth}
              maxHeight={config.sceneMaxHeight}
              canvasWidth={fitWidth}
              canvasHeight={size.height}
              durationMs={config.transformDurationMs}
              zoomPadding={effectiveZoomPadding}
              reducedMotion={reducedMotion}
              onProgress={setLabelProgress}
            />

            {/* Guided orbit: only once the city has arrived, and never
                pan, flip under the ground, or zoom out of frame. */}
          </Canvas>
        ) : null}

        <GridLabels
          tiles={tiles}
          weekCount={weekCount}
          width={size.width}
          height={size.height}
          zoom={baseZoom}
          cellGap={config.cellGap}
          isMobile={isMobile}
          waving={waving}
          progress={labelProgress}
        />


        {isEmpty ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            {/* Keyed on the period so switching between two silent years
                replays the entrance rather than leaving the card sitting
                there with new words in it. */}
            <div
              key={period.id}
              className="pop-in rounded-xl border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-4 py-3 text-center shadow-[var(--shadow-soft)] backdrop-blur-md"
            >
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

    </>
  );
}
