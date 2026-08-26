"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { lerpView, sphericalToCartesian } from "@/lib/three/camera";

/** Far enough to clear the geometry; under orthographic projection the
 * radius has no effect on scale. */
const CAMERA_RADIUS = 220;

/**
 * The scene is always orthographic, but R3F types the frame camera as
 * perspective. Narrow on Three's own runtime discriminator rather than
 * casting — and accept `unknown`, because R3F's bundled camera type and
 * the installed @types/three are structurally incompatible over
 * `isCamera` even though they describe the same object.
 */
function isOrthographic(camera: unknown): camera is THREE.OrthographicCamera {
  return (
    (camera as THREE.OrthographicCamera | null)?.isOrthographicCamera === true
  );
}

/** Seconds for a full 0 -> 1 transform. Matches the spec's ~800ms tilt. */
const TRANSFORM_DURATION_S = 0.8;

type CameraRigProps = {
  /** Where the transform should settle: 0 = flat, 1 = city. */
  target: number;
  /** Shared, frame-updated progress the buildings also read. */
  progressRef: RefObject<number>;
  /** Base zoom in pixels per world unit, fitted to the canvas. */
  baseZoom: number;
  reducedMotion: boolean;
  /** Called when progress changes, to drive the DOM label overlay. */
  onProgress: (progress: number) => void;
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
 */
export function CameraRig({
  target,
  progressRef,
  baseZoom,
  reducedMotion,
  onProgress,
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

    const view = lerpView(next);
    const position = sphericalToCartesian(view.phi, view.theta, CAMERA_RADIUS);

    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(0, 0, 0);
    camera.zoom = baseZoom * view.zoomScale;
    camera.updateProjectionMatrix();

    // Report sparsely: the overlay only needs enough resolution to fade.
    if (Math.abs(next - lastReported.current) > 0.01 || next === target) {
      if (lastReported.current !== next) {
        lastReported.current = next;
        onProgress(next);
      }
    }
  });

  return null;
}
