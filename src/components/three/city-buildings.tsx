"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import {
  computeBuildingHeight,
  GROUND_TILE_HEIGHT,
} from "@/lib/contributions/height";
import { maxCountOf } from "@/lib/contributions/grid";
import { CELL_SIZE, tilePosition, worldHeight } from "@/lib/three/layout";
import { createBuildingGeometry } from "@/lib/three/building-geometry";
import { columnProgress, easeInOutCubic } from "@/lib/three/camera";
import { contributionRampColor, palette } from "@/lib/theme/palette";
import type { SceneTile } from "@/lib/contributions/scene-tiles";

/** Reused scratch objects — allocating per frame would churn the GC. */
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

type BuildingLayout = {
  /** Null for padded future days, which are inert scaffolding. */
  day: ContributionDay | null;
  weekIndex: number;
  x: number;
  z: number;
  flatHeight: number;
  targetHeight: number;
  color: THREE.Color;
};

type CityBuildingsProps = {
  tiles: SceneTile[];
  weekCount: number;
  /** Shared 0..1 transform progress, written by the camera rig. */
  progressRef: RefObject<number>;
  onHoverDay: (day: ContributionDay | null, clientX: number, clientY: number) => void;
};

/** Future tiles sit slightly lower than a zero-contribution ground tile,
 * reading as an empty lot rather than a day with no activity. */
const FUTURE_TILE_HEIGHT_SCALE = 0.45;

/**
 * Every day in the period as one InstancedMesh — a single draw call for
 * the whole city. Heights are a pure function of the shared transform
 * progress, so the rise is inherently reversible and interruptible:
 * scrubbing progress back lowers the buildings along the same curve.
 *
 * A separate damping pass eases heights toward that computed target,
 * which also covers period changes (the target moves, the damping
 * catches up over ~450ms) without any separate animation bookkeeping.
 */
export function CityBuildings({
  tiles,
  weekCount,
  progressRef,
  onHoverDay,
}: CityBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // One geometry shared by every instance; rebuilt never, disposed on
  // unmount.
  const geometry = useMemo(() => createBuildingGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const layout = useMemo<BuildingLayout[]>(() => {
    const maxCount = maxCountOf(
      tiles.flatMap((tile) => (tile.day ? [tile.day] : [])),
    );
    const groundHeight = worldHeight(GROUND_TILE_HEIGHT);
    const futureHeight = groundHeight * FUTURE_TILE_HEIGHT_SCALE;

    return tiles.map((tile) => {
      const { x, z } = tilePosition(tile.weekIndex, tile.weekday, weekCount);

      if (!tile.day) {
        return {
          day: null,
          weekIndex: tile.weekIndex,
          x,
          z,
          flatHeight: futureHeight,
          targetHeight: futureHeight,
          color: new THREE.Color(palette.futureTile),
        };
      }

      const { day } = tile;
      // The same sqrt-normalized value drives both height and color, so
      // a taller building is always a deeper green.
      const normalized = maxCount > 0 ? Math.sqrt(day.count / maxCount) : 0;

      return {
        day,
        weekIndex: tile.weekIndex,
        x,
        z,
        flatHeight: groundHeight,
        targetHeight: worldHeight(computeBuildingHeight(day.count, maxCount)),
        color: new THREE.Color(
          contributionRampColor(normalized, day.count > 0),
        ),
      };
    });
  }, [tiles, weekCount]);

  /** Current rendered height per instance, damped toward the target. */
  const heightsRef = useRef<Float32Array>(new Float32Array(0));

  useEffect(() => {
    const previous = heightsRef.current;
    const next = new Float32Array(layout.length);
    for (let i = 0; i < layout.length; i++) {
      // Carry the in-flight height forward where the instance still
      // exists, so switching year morphs rather than collapsing first.
      next[i] = i < previous.length ? previous[i] : layout[i].flatHeight;
    }
    heightsRef.current = next;
  }, [layout]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const heights = heightsRef.current;
    if (heights.length !== layout.length) return;

    const progress = progressRef.current;

    // Critically damped: smooth, never overshoots, and stays correct when
    // the target moves mid-flight.
    const blend = 1 - Math.exp(-11 * delta);
    let moved = false;

    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      const eased = easeInOutCubic(
        columnProgress(progress, item.weekIndex, weekCount),
      );
      const target =
        item.flatHeight + (item.targetHeight - item.flatHeight) * eased;

      const current = heights[i];
      const next =
        Math.abs(target - current) < 0.0005
          ? target
          : current + (target - current) * blend;

      if (next !== current) {
        heights[i] = next;
        moved = true;
      }

      const height = Math.max(heights[i], 0.001);
      scratchPosition.set(item.x, height / 2, item.z);
      scratchScale.set(CELL_SIZE, height, CELL_SIZE);
      scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
      mesh.setMatrixAt(i, scratchMatrix);
    }

    if (moved) mesh.instanceMatrix.needsUpdate = true;
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
      // InstancedMesh count is fixed at construction, so a changed day
      // count needs a fresh mesh.
      key={layout.length}
      args={[undefined, undefined, Math.max(layout.length, 1)]}
      castShadow
      receiveShadow
      onPointerMove={(event) => {
        event.stopPropagation();
        const index = event.instanceId;
        if (index === undefined) return;
        // Future tiles have no day and deliberately show no tooltip.
        onHoverDay(layout[index]?.day ?? null, event.clientX, event.clientY);
      }}
      onPointerOut={() => onHoverDay(null, 0, 0)}
    >
      <primitive object={geometry} attach="geometry" />
      <meshLambertMaterial />
    </instancedMesh>
  );
}
