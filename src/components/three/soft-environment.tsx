"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * A generated environment map for the buildings' reflections.
 *
 * MeshStandardMaterial is a physically based model and expects
 * image-based lighting. With only an ambient and one directional light,
 * roughness and metalness do almost nothing and it renders duller than
 * the Lambert it replaced. This supplies the missing piece.
 *
 * RoomEnvironment is procedural and ships with three, so this costs a
 * few KB of code and no network request -- unlike the usual HDRI, which
 * would be a download and would run into the artifact CSP.
 */
export function SoftEnvironment() {
  const gl = useThree((state) => state.gl);

  const texture = useMemo(() => {
    // R3F bundles @types/three 0.185 while three itself is pinned to
    // 0.182, so the two WebGLRenderer types are structurally
    // incompatible even though this is one object at runtime.
    const generator = new THREE.PMREMGenerator(
      gl as unknown as THREE.WebGLRenderer,
    );
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);

    // The scene and generator are only needed to bake the texture.
    room.dispose();
    generator.dispose();
    return target.texture;
  }, [gl]);

  useEffect(() => () => texture.dispose(), [texture]);

  // Attached declaratively rather than assigning scene.environment, which
  // would be mutating a value React owns.
  return <primitive attach="environment" object={texture} />;
}
