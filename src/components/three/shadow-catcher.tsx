"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { easeInOutCubic } from "@/lib/three/camera";

/** Shadow strength at the fully tilted city view. */
const MAX_SHADOW_OPACITY = 0.14;

type ShadowCatcherProps = {
  progressRef: RefObject<number>;
  enabled: boolean;
};

/**
 * Invisible ground plane that renders only where shadows fall.
 *
 * Shadows belong to the city, not to the chart: seen from directly
 * overhead they sit squarely under each tile and read as a rendering
 * artefact rather than depth. So the shadow fades in with the tilt and is
 * gone by the time the view is flat.
 */
export function ShadowCatcher({ progressRef, enabled }: ShadowCatcherProps) {
  const materialRef = useRef<THREE.ShadowMaterial>(null);

  useFrame(() => {
    const material = materialRef.current;
    if (!material) return;

    const next = MAX_SHADOW_OPACITY * easeInOutCubic(progressRef.current);
    if (material.opacity !== next) material.opacity = next;
  });

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
      receiveShadow={enabled}
    >
      <planeGeometry args={[600, 600]} />
      <shadowMaterial ref={materialRef} transparent opacity={0} />
    </mesh>
  );
}
