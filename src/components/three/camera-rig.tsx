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

/** Seconds for a full 0 -> 1 transform. Matches the spec's ~800ms tilt. */
const TRANSFORM_DURATION_S = 0.8;

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
  /** True once the transform has settled at the city view and the user
   * has taken over via OrbitControls. */
  orbiting: boolean;
  gridWidth: number;
  gridDepth: number;
  maxHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  reducedMotion: boolean;
  onProgress: (progress: number) => void;
  onSettled: (settled: boolean) => void;
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
  orbiting,
  gridWidth,
  gridDepth,
  maxHeight,
  canvasWidth,
  canvasHeight,
  reducedMotion,
  onProgress,
  onSettled,
}: CameraRigProps) {
  const lastReported = useRef(-1);

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
    if (orbiting) {
      cityViewRef.current = cartesianToSpherical(
        camera.position.x,
        camera.position.y,
        camera.position.z,
      );
      return;
    }

    const current = progressRef.current;

    let next: number;
    if (reducedMotion) {
      next = target;
    } else {
      const step = delta / TRANSFORM_DURATION_S;
      next =
        target > current
          ? Math.min(target, current + step)
          : Math.max(target, current - step);
    }
    progressRef.current = next;

    const view = lerpView(next, cityViewRef.current);
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
