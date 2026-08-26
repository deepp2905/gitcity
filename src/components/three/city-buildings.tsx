"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import { maxCountOf } from "@/lib/contributions/grid";
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
      // The same sqrt-normalized value drives both height and color, so
      // a taller building is always a deeper green.
      const normalized = maxCount > 0 ? Math.sqrt(day.count / maxCount) : 0;
      const scaled =
        day.count > 0
          ? config.groundTileHeight +
            normalized * (1 - config.groundTileHeight)
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

  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);
  const lastTargetRef = useRef(target);

  useEffect(() => {
    const previous = heightsRef.current;
    const next = new Float32Array(layout.length);
    for (let i = 0; i < layout.length; i++) {
      next[i] = i < previous.length ? previous[i] : layout[i].restHeight;
    }
    heightsRef.current = next;
    velocitiesRef.current = new Float32Array(layout.length);
    flattenFromRef.current = next.slice();
  }, [layout]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const heights = heightsRef.current;
    const velocities = velocitiesRef.current;
    if (heights.length !== layout.length) return;

    // Restart the clock whenever the direction changes, and snapshot the
    // current heights so a flatten eases from wherever the bounce got to.
    if (target !== lastTargetRef.current) {
      lastTargetRef.current = target;
      elapsedRef.current = 0;
      accumulatorRef.current = 0;
      flattenFromRef.current = heights.slice();
    }

    elapsedRef.current += delta * 1000;
    const elapsed = elapsedRef.current;

    if (target === 0 || reducedMotion) {
      // Eased descent (or an instant switch under reduced motion).
      const t = reducedMotion
        ? 1
        : Math.min(1, elapsed / Math.max(1, config.flattenDurationMs));
      const eased = easeInOutCubic(t);
      const from = flattenFromRef.current;

      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        const start = reducedMotion ? item.restHeight : from[i];
        heights[i] = start + (item.restHeight - start) * eased;
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
          elapsed >= item.delayMs ? item.riseHeight : item.restHeight;

        const stepped = stepSpring(
          heights[i],
          velocities[i],
          springTarget,
          settings,
          SPRING_TIMESTEP_S,
        );
        // Never let a bounce sink a building through the ground.
        heights[i] = Math.max(stepped.value, item.restHeight);
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
