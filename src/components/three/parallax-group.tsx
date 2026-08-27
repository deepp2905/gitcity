"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { degToRad } from "@/lib/three/camera";

/** How quickly the tilt chases the pointer. Low enough to feel like the
 * city is heavy rather than glued to the cursor. */
const FOLLOW_LAMBDA = 4;

/** The tipping axis gets less range than the turning axis: rotating a
 * wide, shallow ribbon forward reads as much stronger than turning it. */
const TIP_AXIS_SCALE = 0.55;

export type Pointer = { x: number; y: number };

type ParallaxGroupProps = {
  /** Pointer position over the viewport, each axis normalized to -1..1. */
  pointerRef: RefObject<Pointer>;
  /** Camera transform progress, so the tilt belongs to the city only. */
  progressRef: RefObject<number>;
  /** Maximum rotation at the edge of the viewport, in degrees. */
  strengthDeg: number;
  reducedMotion: boolean;
  children: ReactNode;
};

/**
 * Leans the city slightly toward the pointer.
 *
 * The city rotates, not the camera: once the transform settles the camera
 * belongs to OrbitControls, and writing to it here would fight both the
 * user's drag and the controls' damping. Rotating the group instead
 * composes with orbiting rather than competing with it.
 *
 * The range is bounded by construction. The pointer is normalized to
 * -1..1 across the viewport and multiplied by a fixed maximum, so the
 * tilt is a function of where the cursor is, never of how far it has
 * travelled -- moving around for a minute lands in the same place as
 * arriving directly.
 */
export function ParallaxGroup({
  pointerRef,
  progressRef,
  strengthDeg,
  reducedMotion,
  children,
}: ParallaxGroupProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Scaled by transform progress, so the flat chart never leans and the
    // effect arrives with the city rather than switching on.
    const strength = reducedMotion
      ? 0
      : degToRad(strengthDeg) * progressRef.current;

    const pointer = pointerRef.current;
    const targetY = pointer.x * strength;
    const targetX = pointer.y * strength * TIP_AXIS_SCALE;

    const blend = 1 - Math.exp(-FOLLOW_LAMBDA * delta);
    group.rotation.y += (targetY - group.rotation.y) * blend;
    group.rotation.x += (targetX - group.rotation.x) * blend;
  });

  return <group ref={groupRef}>{children}</group>;
}
