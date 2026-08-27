"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import {
  cartesianToSpherical,
  fitZoomForView,
  lerpView,
  sphericalToCartesian,
  type CameraView,
} from "@/lib/three/camera";

/** Far enough to clear the geometry; under orthographic projection the
 * radius has no effect on scale. */
const CAMERA_RADIUS = 220;

/** Orbit reporting cadence. Fast enough to feel live in the tuning
 * panel, slow enough that React isn't re-rendering every frame. */
const ORBIT_REPORT_MS = 100;

/** Radians of movement below which an orbit report is not worth sending. */
const ORBIT_REPORT_EPSILON = 0.004;



/** The scene is always orthographic, but R3F types the frame camera as
 * perspective. Narrow on Three's own runtime discriminator rather than
 * casting — and accept `unknown`, because R3F's bundled camera type and
 * the installed @types/three are structurally incompatible over
 * `isCamera` even though they describe the same object. */
function isOrthographic(camera: unknown): camera is THREE.OrthographicCamera {
  return (
    (camera as THREE.OrthographicCamera | null)?.isOrthographicCamera === true
  );
}

type CameraRigProps = {
  /** Where the transform should settle: 0 = flat, 1 = city. */
  target: number;
  /** Shared, frame-updated progress the buildings also read. */
  progressRef: RefObject<number>;
  /** Mutable tilted-view angles, updated while the user orbits. */
  cityViewRef: RefObject<CameraView>;
  /** The near-vertical end of the transform, from scene config. */
  flatView: CameraView;
  /**
   * A one-shot camera placement to apply even while OrbitControls owns
   * the camera. Set when a tuning slider changes the framing; the rig
   * applies it, hands OrbitControls the result, and clears it.
   */
  cameraOverrideRef: RefObject<CameraView | null>;
  /** True once the transform has settled at the city view and the user
   * has taken over via OrbitControls. */
  orbiting: boolean;
  gridWidth: number;
  gridDepth: number;
  maxHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Milliseconds for a full 0 -> 1 transform. */
  durationMs: number;
  zoomPadding: number;
  reducedMotion: boolean;
  onProgress: (progress: number) => void;
  onSettled: (settled: boolean) => void;
  /** Reports where the user has orbited to, so the tuning panel can
   * follow the camera as well as drive it. */
  onOrbit: (view: CameraView) => void;
};

/**
 * Drives the orthographic camera from an almost-straight-down view (which
 * reads as the flat 2D grid) to a tilted city view, and back.
 *
 * Progress advances at a constant rate toward its target rather than
 * damping asymptotically, so the transform has a definite duration; the
 * easing lives in lerpView and the per-column rise curve. Reversing
 * mid-flight simply flips the direction from wherever progress currently
 * is, which is what makes the toggle interruptible.
 *
 * Once settled at the city view the rig stops writing the camera and
 * hands over to OrbitControls, tracking the resulting angles so that
 * flattening later starts from wherever the user left it.
 */
export function CameraRig({
  target,
  progressRef,
  cityViewRef,
  flatView,
  cameraOverrideRef,
  orbiting,
  gridWidth,
  gridDepth,
  maxHeight,
  canvasWidth,
  canvasHeight,
  durationMs,
  zoomPadding,
  reducedMotion,
  onProgress,
  onSettled,
  onOrbit,
}: CameraRigProps) {
  const lastReported = useRef(-1);
  const lastOrbitReport = useRef({ at: 0, phi: NaN, theta: NaN });

  // With reduced motion the view switches immediately, with no camera
  // travel and no rise animation.
  useEffect(() => {
    if (!reducedMotion) return;
    progressRef.current = target;
  }, [reducedMotion, target, progressRef]);

  // The camera comes from the frame state rather than useThree: it's the
  // renderer's own mutable object, not a value owned by React render.
  useFrame((state, delta) => {
    const camera = state.camera;
    if (!isOrthographic(camera)) return;

    // Hands off: OrbitControls owns the camera. Track where the user has
    // moved it so a later flatten departs from exactly there.
    //
    // Only while the city is still the requested state: without the
    // target check the rig stayed in this branch after a flatten was
    // requested and silently ignored it, so the toggle changed state but
    // the camera never moved.
    if (orbiting && target === 1) {
      const override = cameraOverrideRef.current;

      if (override) {
        // A slider moved the framing. Place the camera, then let
        // OrbitControls re-derive its own state from that position:
        // update() rebuilds its spherical from the camera each call, so
        // it adopts the new angle instead of snapping back to its own.
        cameraOverrideRef.current = null;
        cityViewRef.current = { ...override };

        const placed = sphericalToCartesian(
          override.phi,
          override.theta,
          CAMERA_RADIUS,
        );
        camera.position.set(placed.x, placed.y, placed.z);
        camera.lookAt(0, 0, 0);
        camera.zoom = fitZoomForView(
          canvasWidth,
          canvasHeight,
          gridWidth,
          gridDepth,
          maxHeight,
          override,
          zoomPadding,
        );
        camera.updateProjectionMatrix();

        (state.controls as { update?: () => void } | null)?.update?.();
        return;
      }

      const orbited = cartesianToSpherical(
        camera.position.x,
        camera.position.y,
        camera.position.z,
      );
      cityViewRef.current = orbited;

      // Throttled, and only when it actually moved: this drives React
      // state, so reporting every frame would re-render continuously.
      const last = lastOrbitReport.current;
      // No previous report yet. Comparing against NaN yields NaN, which is
      // never greater than the epsilon, so this has to be handled up front
      // or the first report never fires and the values stay NaN forever.
      const firstReport =
        !Number.isFinite(last.phi) || !Number.isFinite(last.theta);
      const moved =
        firstReport ||
        Math.abs(orbited.phi - last.phi) > ORBIT_REPORT_EPSILON ||
        Math.abs(orbited.theta - last.theta) > ORBIT_REPORT_EPSILON;

      if (moved && performance.now() - last.at > ORBIT_REPORT_MS) {
        lastOrbitReport.current = {
          at: performance.now(),
          phi: orbited.phi,
          theta: orbited.theta,
        };
        onOrbit(orbited);
      }
      return;
    }

    // The rig is authoritative here, so a queued override is redundant.
    cameraOverrideRef.current = null;

    const current = progressRef.current;

    let next: number;
    if (reducedMotion) {
      next = target;
    } else {
      const step = delta / Math.max(0.001, durationMs / 1000);
      next =
        target > current
          ? Math.min(target, current + step)
          : Math.max(target, current - step);
    }
    progressRef.current = next;

    const view = lerpView(next, cityViewRef.current, flatView);
    const position = sphericalToCartesian(view.phi, view.theta, CAMERA_RADIUS);

    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(0, 0, 0);
    // Re-fit every frame against the real projected bounds, so the city
    // stays framed as it tilts and grows rather than drifting small.
    camera.zoom = fitZoomForView(
      canvasWidth,
      canvasHeight,
      gridWidth,
      gridDepth,
      maxHeight * next,
      view,
      zoomPadding,
    );
    camera.updateProjectionMatrix();

    // Report sparsely: the overlay only needs enough resolution to fade.
    if (Math.abs(next - lastReported.current) > 0.01 || next === target) {
      if (lastReported.current !== next) {
        lastReported.current = next;
        onProgress(next);
      }
    }

    // Only give the camera away once fully arrived at the city view.
    onSettled(next === 1 && target === 1);
  });

  return null;
}
