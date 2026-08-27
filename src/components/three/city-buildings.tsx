"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import { maxCountOf } from "@/lib/contributions/grid";
import { normalizeCount, scaleHeight } from "@/lib/contributions/height";
import type { SceneTile } from "@/lib/contributions/scene-tiles";
import { CELL_SIZE, tilePosition, worldHeight } from "@/lib/three/layout";
import { createBuildingGeometry } from "@/lib/three/building-geometry";
import { easeInOutCubic } from "@/lib/three/camera";
import {
  MAX_ACCUMULATED_S,
  SPRING_TIMESTEP_S,
  columnDelayMs,
  stepSpring,
} from "@/lib/three/spring";
import type { SceneConfig } from "@/lib/three/config";
import { contributionRampColor, palette } from "@/lib/theme/palette";

/** Reused scratch objects — allocating per frame would churn the GC. */
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

/** Future tiles sit slightly lower than a zero-contribution ground tile,
 * reading as an empty lot rather than a day with no activity. */
const FUTURE_TILE_HEIGHT_SCALE = 0.45;

type BuildingLayout = {
  /** Null for padded future days, which are inert scaffolding. */
  day: ContributionDay | null;
  weekIndex: number;
  x: number;
  z: number;
  restHeight: number;
  riseHeight: number;
  delayMs: number;
  color: THREE.Color;
};

type CityBuildingsProps = {
  tiles: SceneTile[];
  weekCount: number;
  /** 1 while the city is wanted, 0 while flattening. */
  target: number;
  /** Shared camera transform progress, 0..1. */
  progressRef: RefObject<number>;
  /**
   * Identity of what is being shown. Changing it replays the staggered
   * rise, so switching year rebuilds the city rather than silently
   * retargeting springs that are already extended.
   */
  riseKey: string;
  config: SceneConfig;
  reducedMotion: boolean;
  onHoverDay: (day: ContributionDay | null, clientX: number, clientY: number) => void;
};

/**
 * Every day in the period as one InstancedMesh: a single draw call for
 * the whole city.
 *
 * Rising is sprung — each building is its own damped spring, released on
 * a per-column delay so the wave sweeps left to right. Flattening is
 * eased instead: a spring caught mid-bounce still carries velocity, and
 * letting that fight the descent reads as a glitch rather than as
 * character.
 */
export function CityBuildings({
  tiles,
  weekCount,
  target,
  progressRef,
  riseKey,
  config,
  reducedMotion,
  onHoverDay,
}: CityBuildingsProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(
    () => createBuildingGeometry(config.cornerRadiusRatio),
    [config.cornerRadiusRatio],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const layout = useMemo<BuildingLayout[]>(() => {
    const maxCount = maxCountOf(
      tiles.flatMap((tile) => (tile.day ? [tile.day] : [])),
    );
    const groundHeight = worldHeight(
      config.groundTileHeight,
      config.sceneMaxHeight,
    );

    return tiles.map((tile) => {
      const { x, z } = tilePosition(
        tile.weekIndex,
        tile.weekday,
        weekCount,
        config.cellGap,
      );
      const delayMs = columnDelayMs(
        tile.weekIndex,
        weekCount,
        config.staggerTotalMs,
        config.staggerCurve,
      );

      if (!tile.day) {
        const futureHeight = groundHeight * FUTURE_TILE_HEIGHT_SCALE;
        return {
          day: null,
          weekIndex: tile.weekIndex,
          x,
          z,
          restHeight: futureHeight,
          riseHeight: futureHeight,
          delayMs,
          color: new THREE.Color(palette.futureTile),
        };
      }

      const { day } = tile;
      // One normalized value drives both height and color, so a taller
      // building is always a deeper green. Switching the scale therefore
      // changes both, which is what makes the comparison honest: linear
      // flattens the palette exactly as it flattens the skyline.
      const normalized = normalizeCount(
        day.count,
        maxCount,
        config.heightScale,
      );
      const scaled =
        day.count > 0
          ? scaleHeight(normalized, config.groundTileHeight)
          : config.groundTileHeight;

      return {
        day,
        weekIndex: tile.weekIndex,
        x,
        z,
        restHeight: groundHeight,
        riseHeight: worldHeight(scaled, config.sceneMaxHeight),
        delayMs,
        color: new THREE.Color(
          contributionRampColor(normalized, day.count > 0),
        ),
      };
    });
  }, [tiles, weekCount, config]);

  /** Live spring state, one entry per instance. */
  const heightsRef = useRef<Float32Array>(new Float32Array(0));
  const velocitiesRef = useRef<Float32Array>(new Float32Array(0));
  /** Heights when the current flatten began, for the eased descent. */
  const flattenFromRef = useRef<Float32Array>(new Float32Array(0));
  /**
   * Height each building holds at until its column's delay elapses.
   *
   * Ground level when rising from flat, so the wave has something to
   * travel across. The *current* height when the period changes, so
   * switching year morphs each column in turn instead of collapsing the
   * city and rebuilding it.
   */
  const holdHeightsRef = useRef<Float32Array>(new Float32Array(0));
  /** False until the camera has tilted far enough for height to read. */
  const riseStartedRef = useRef(false);

  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);
  const lastTargetRef = useRef(target);
  const lastRiseKeyRef = useRef(riseKey);

  useEffect(() => {
    const previous = heightsRef.current;
    const next = new Float32Array(layout.length);
    for (let i = 0; i < layout.length; i++) {
      next[i] = i < previous.length ? previous[i] : layout[i].restHeight;
    }
    heightsRef.current = next;
    velocitiesRef.current = new Float32Array(layout.length);
    flattenFromRef.current = next.slice();
    holdHeightsRef.current = next.slice();
  }, [layout]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const heights = heightsRef.current;
    const velocities = velocitiesRef.current;
    if (heights.length !== layout.length) return;

    // Replay the staggered rise whenever the direction changes or the
    // period does. Without the riseKey check a year switch simply
    // retargeted springs that were already extended, so the wave only
    // ever played on first load.
    const directionChanged = target !== lastTargetRef.current;
    const periodChanged = riseKey !== lastRiseKeyRef.current;

    if (directionChanged || periodChanged) {
      lastTargetRef.current = target;
      lastRiseKeyRef.current = riseKey;
      elapsedRef.current = 0;
      accumulatorRef.current = 0;

      // A change of direction starts the rise from the ground and waits
      // for the camera; a change of period keeps the city standing and
      // morphs it column by column, starting immediately because the
      // camera is already tilted.
      riseStartedRef.current = !directionChanged;

      const hold = holdHeightsRef.current;
      for (let i = 0; i < layout.length; i++) {
        hold[i] = directionChanged ? layout[i].restHeight : heights[i];
      }
      if (directionChanged && target === 1 && !reducedMotion) {
        for (let i = 0; i < layout.length; i++) {
          heights[i] = layout[i].restHeight;
          velocities[i] = 0;
        }
      }
      // Snapshot for the eased descent, after any reset above.
      flattenFromRef.current = heights.slice();
    }

    // Under orthographic projection a straight-down camera shows no
    // height whatsoever, so a wave that plays while the camera is still
    // overhead is invisible. Hold the clock until the tilt is readable.
    if (!riseStartedRef.current && progressRef.current >= config.riseStartProgress) {
      riseStartedRef.current = true;
    }
    if (riseStartedRef.current) elapsedRef.current += delta * 1000;
    const elapsed = elapsedRef.current;

    if (reducedMotion) {
      // Snap to whichever state was asked for. No travel, but still the
      // correct end result: sharing the descent branch here left the city
      // permanently flat even in 3D.
      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        heights[i] = target === 1 ? item.riseHeight : item.restHeight;
        velocities[i] = 0;
        writeInstance(mesh, i, item, heights[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    if (target === 0) {
      // Eased descent from wherever the bounce got to.
      const t = Math.min(1, elapsed / Math.max(1, config.flattenDurationMs));
      const eased = easeInOutCubic(t);
      const from = flattenFromRef.current;

      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        heights[i] = from[i] + (item.restHeight - from[i]) * eased;
        velocities[i] = 0;
        writeInstance(mesh, i, item, heights[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      return;
    }

    // Rising: fixed-timestep spring integration. Stepping with the raw
    // frame delta goes unstable when a frame is dropped.
    accumulatorRef.current = Math.min(
      accumulatorRef.current + delta,
      MAX_ACCUMULATED_S,
    );

    const settings = {
      stiffness: config.stiffness,
      dampingRatio: config.dampingRatio,
    };

    while (accumulatorRef.current >= SPRING_TIMESTEP_S) {
      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        // Held at rest until this column's turn.
        const springTarget =
          riseStartedRef.current && elapsed >= item.delayMs
            ? item.riseHeight
            : holdHeightsRef.current[i];

        const stepped = stepSpring(
          heights[i],
          velocities[i],
          springTarget,
          settings,
          SPRING_TIMESTEP_S,
        );
        // Never let a bounce sink a building through the ground.
        heights[i] = Math.max(stepped.value, layout[i].restHeight);
        velocities[i] = stepped.velocity;
      }
      accumulatorRef.current -= SPRING_TIMESTEP_S;
    }

    for (let i = 0; i < layout.length; i++) {
      writeInstance(mesh, i, layout[i], heights[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
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

function writeInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  item: BuildingLayout,
  rawHeight: number,
) {
  const height = Math.max(rawHeight, 0.001);
  scratchPosition.set(item.x, height / 2, item.z);
  scratchScale.set(CELL_SIZE, height, CELL_SIZE);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}
