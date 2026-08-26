"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import {
  computeBuildingHeight,
  GROUND_TILE_HEIGHT,
} from "@/lib/contributions/height";
import { maxCountOf } from "@/lib/contributions/grid";
import {
  CELL_SIZE,
  riseDelayMs,
  tilePosition,
  worldHeight,
} from "@/lib/three/layout";
import { levelColorByName } from "@/lib/theme/palette";

/** Reused scratch objects — allocating per frame would churn the GC. */
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

type BuildingLayout = {
  day: ContributionDay;
  x: number;
  z: number;
  targetHeight: number;
  delayMs: number;
  color: THREE.Color;
};

type CityBuildingsProps = {
  days: ContributionDay[];
  weekCount: number;
  /** Skips the rise animation and snaps to full height. */
  reducedMotion: boolean;
  /** Bumped when the period changes, to retarget heights and colors. */
  transitionKey: string;
  onHoverDay: (day: ContributionDay | null, clientX: number, clientY: number) => void;
};

/**
 * Every day in the period as a single instanced mesh — one draw call for
 * the whole city, per the performance budget. Per-instance color carries
 * the contribution level; raycasting against the instance id drives
 * tooltips.
 */
export function CityBuildings({
  days,
  weekCount,
  reducedMotion,
  transitionKey,
  onHoverDay,
}: CityBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const layout = useMemo<BuildingLayout[]>(() => {
    const maxCount = maxCountOf(days);
    return days.map((day) => {
      const { x, z } = tilePosition(day.weekIndex, day.weekday, weekCount);
      return {
        day,
        x,
        z,
        targetHeight: worldHeight(computeBuildingHeight(day.count, maxCount)),
        delayMs: riseDelayMs(day.weekIndex, weekCount),
        color: new THREE.Color(levelColorByName[day.level]),
      };
    });
  }, [days, weekCount]);

  /** Current animated height per instance, damped toward the target. */
  const heightsRef = useRef<Float32Array>(new Float32Array(0));
  const startRef = useRef<number>(0);

  // Restart the rise whenever the period (and therefore the targets)
  // changes. Heights animate from the current value, so interrupting a
  // transition damps from wherever it got to rather than snapping.
  useEffect(() => {
    const previous = heightsRef.current;
    const next = new Float32Array(layout.length);

    for (let i = 0; i < layout.length; i++) {
      if (reducedMotion) {
        next[i] = layout[i].targetHeight;
      } else {
        // Carry over the in-flight height where the instance still
        // exists, so a year switch morphs instead of collapsing.
        next[i] = i < previous.length ? previous[i] : worldHeight(GROUND_TILE_HEIGHT);
      }
    }

    heightsRef.current = next;
    startRef.current = performance.now();
  }, [layout, reducedMotion, transitionKey]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const heights = heightsRef.current;
    const elapsed = performance.now() - startRef.current;

    // Critically-damped approach: smooth, never overshoots, and remains
    // correct when the target changes mid-flight.
    const lambda = 9;
    const blend = 1 - Math.exp(-lambda * delta);

    let needsUpdate = false;

    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      const target =
        reducedMotion || elapsed >= item.delayMs
          ? item.targetHeight
          : worldHeight(GROUND_TILE_HEIGHT);

      const current = heights[i];
      const next = reducedMotion ? target : current + (target - current) * blend;

      if (Math.abs(next - current) > 0.0001) {
        heights[i] = next;
        needsUpdate = true;
      } else if (heights[i] !== target) {
        heights[i] = target;
        needsUpdate = true;
      }

      const height = Math.max(heights[i], 0.001);
      scratchPosition.set(item.x, height / 2, item.z);
      scratchScale.set(CELL_SIZE, height, CELL_SIZE);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      mesh.setMatrixAt(i, scratchMatrix);
    }

    if (needsUpdate) mesh.instanceMatrix.needsUpdate = true;
  });

  // Per-instance colors only change when the period does.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < layout.length; i++) {
      mesh.setColorAt(i, scratchColor.copy(layout[i].color));
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [layout]);

  return (
    <instancedMesh
      ref={meshRef}
      // `key` forces a fresh mesh when the instance count changes, since
      // InstancedMesh count is fixed at construction.
      key={layout.length}
      args={[undefined, undefined, layout.length]}
      castShadow
      receiveShadow
      onPointerMove={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        if (index === undefined) return;
        onHoverDay(layout[index]?.day ?? null, event.clientX, event.clientY);
      }}
      onPointerOut={() => onHoverDay(null, 0, 0)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshLambertMaterial />
    </instancedMesh>
  );
}
