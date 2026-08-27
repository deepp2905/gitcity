"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import { maxCountOf } from "@/lib/contributions/grid";
import { normalizeCount, scaleHeight } from "@/lib/contributions/height";
import type { SceneTile } from "@/lib/contributions/scene-tiles";
import {
  CELL_SIZE,
  buildingsBoundingSphere,
  tilePosition,
  worldHeight,
} from "@/lib/three/layout";
import { createBuildingGeometry } from "@/lib/three/building-geometry";
import { easeInOutCubic, easeOutCubic } from "@/lib/three/camera";
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
  /** Rise-wave delay, used by the 3D spring release. */
  delayMs: number;
  /** Recolour-wave delay, used only in the flat state. */
  colorDelayMs: number;
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
      // The flat state recolours on its own, faster schedule: it is a
      // chart update, not a skyline rising.
      const colorDelayMs = columnDelayMs(
        tile.weekIndex,
        weekCount,
        config.colorStaggerMs,
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
          colorDelayMs,
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
        colorDelayMs,
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
  /** Current rendered colour per instance, as flat RGB triples. */
  const colorsRef = useRef<Float32Array>(new Float32Array(0));
  /** Colour each instance held when the period changed, for the fade. */
  const colorFromRef = useRef<Float32Array>(new Float32Array(0));
  /** True while a period change is still fading colours toward their
   * new targets. */
  const colorFadingRef = useRef(false);
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

    // Carry existing colours forward so a period change fades from what
    // is on screen; only brand-new instances start at their target.
    const previousColors = colorsRef.current;
    const nextColors = new Float32Array(layout.length * 3);
    for (let i = 0; i < layout.length; i++) {
      const base = i * 3;
      if (base + 2 < previousColors.length) {
        nextColors[base] = previousColors[base];
        nextColors[base + 1] = previousColors[base + 1];
        nextColors[base + 2] = previousColors[base + 2];
      } else {
        const { r, g, b } = layout[i].color;
        nextColors[base] = r;
        nextColors[base + 1] = g;
        nextColors[base + 2] = b;
      }
    }
    colorsRef.current = nextColors;
    colorFromRef.current = nextColors.slice();
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

      // A period change is the only thing that alters colour. Fade from
      // whatever is on screen rather than letting the effect snap it,
      // which made a building recolour fully before it started moving.
      if (periodChanged) {
        colorFromRef.current.set(colorsRef.current);
        colorFadingRef.current = true;
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

      // Snap colour too, or this early return would leave the previous
      // period's colours on screen.
      if (colorFadingRef.current) {
        colorFadingRef.current = fadeColors(
          mesh,
          layout,
          colorsRef.current,
          colorFromRef.current,
          () => 1,
        );
      }
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

      // Colour is the whole visualisation in the flat state, so it has to
      // update here too. This branch returns early, which previously left
      // a year switch in 2D showing the previous year's colours.
      if (colorFadingRef.current) {
        // Its own budget, not the flatten's: flattenDurationMs paces the
        // height descent from 3D, which is a different gesture and would
        // make a plain year switch feel sluggish.
        const duration = Math.max(1, config.colorFadeMs);
        colorFadingRef.current = fadeColors(
          mesh,
          layout,
          colorsRef.current,
          colorFromRef.current,
          // Ease-out, not ease-in-out: this is a value changing rather
          // than an object moving, and the slow start of an ease-in-out
          // reads as lag on a short fade.
          (i) =>
            easeOutCubic((elapsed - layout[i].colorDelayMs) / duration),
        );
      }
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

    if (colorFadingRef.current) {
      const hold = holdHeightsRef.current;
      colorFadingRef.current = fadeColors(
        mesh,
        layout,
        colorsRef.current,
        colorFromRef.current,
        (i) => {
          // Tie colour to how far this building has travelled, so the two
          // move as one gesture instead of recolouring then dropping. A
          // building whose height is unchanged has an unchanged colour
          // too, since both derive from the same normalized value.
          const span = layout[i].riseHeight - hold[i];
          if (Math.abs(span) < 1e-6) return 1;
          return Math.min(1, Math.max(0, (heights[i] - hold[i]) / span));
        },
      );
    }
  });

  // Pushes the current colour buffer to a freshly built mesh. The frame
  // loop owns colour after this; it only writes while a fade is running.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    writeColors(mesh, colorsRef.current, layout.length);
  }, [layout]);

  // Supply the raycast bounding sphere rather than letting Three derive
  // it. It computes one lazily on the first raycast and caches it, which
  // captures whatever height the buildings happened to be at that moment
  // and makes every later hover miss.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { centerY, radius } = buildingsBoundingSphere(
      weekCount,
      config.cellGap,
      config.sceneMaxHeight,
    );
    mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, centerY, 0),
      radius,
    );
  }, [layout, weekCount, config.cellGap, config.sceneMaxHeight]);

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

/**
 * Advances the colour fade and pushes it to the mesh. Returns whether any
 * instance is still short of its target.
 *
 * `progressOf` is supplied per call because the two states measure
 * progress differently: raised buildings tie colour to how far they have
 * travelled, so the two read as one gesture, while a flat grid has no
 * height motion to couple to and falls back to elapsed time.
 */
function fadeColors(
  mesh: THREE.InstancedMesh,
  layout: BuildingLayout[],
  colors: Float32Array,
  from: Float32Array,
  progressOf: (index: number) => number,
): boolean {
  let stillFading = false;

  for (let i = 0; i < layout.length; i++) {
    const progress = progressOf(i);
    if (progress < 1) stillFading = true;

    const base = i * 3;
    const target = layout[i].color;
    colors[base] = from[base] + (target.r - from[base]) * progress;
    colors[base + 1] = from[base + 1] + (target.g - from[base + 1]) * progress;
    colors[base + 2] = from[base + 2] + (target.b - from[base + 2]) * progress;
  }

  writeColors(mesh, colors, layout.length);
  return stillFading;
}

function writeColors(
  mesh: THREE.InstancedMesh,
  colors: Float32Array,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const r = colors[base];
    const g = colors[base + 1];
    const b = colors[base + 2];

    // A non-finite channel writes NaN into the instanceColor attribute,
    // and NaN renders the instance black rather than failing loudly.
    // Leave whatever the instance already had instead.
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
      continue;
    }

    scratchColor.setRGB(r, g, b);
    mesh.setColorAt(i, scratchColor);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
