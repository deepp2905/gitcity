"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ContributionDay } from "@/lib/contributions/types";
import { maxCountOf } from "@/lib/contributions/grid";
import { normalizeCount, scaleHeight } from "@/lib/contributions/height";
import type { SceneTile } from "@/lib/contributions/scene-tiles";
import { CELL_SIZE, tilePosition, worldHeight } from "@/lib/three/layout";
import { createBuildingGeometry } from "@/lib/three/building-geometry";
import { easeInOutCubic, easeOutCubic } from "@/lib/three/camera";
import {
  WAVE_MIN_FOOTPRINT,
  WAVE_SETTLE_MS,
  arrivalOrder,
  waveValueAt,
} from "@/lib/three/wave";
import {
  MAX_ACCUMULATED_S,
  SPRING_TIMESTEP_S,
  columnDelayMs,
  stepSpring,
} from "@/lib/three/spring";
import type { SceneConfig } from "@/lib/three/config";
import { contributionRampColor, palette, waveLevelColor } from "@/lib/theme/palette";

/** Reused scratch objects — allocating per frame would churn the GC. */
const scratchMatrix = new THREE.Matrix4();
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();
const scratchPointer = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();

/**
 * How fast the swell chases the pointer. Low enough that the city feels
 * heavy: the bulge arrives a moment after the cursor rather than being
 * welded to it, which is what stops it reading as a cursor decoration.
 */
const SWELL_FOLLOW_LAMBDA = 9;

/**
 * How long the swell takes to rise and to settle, in milliseconds.
 *
 * A duration with an easing curve, not exponential damping like the
 * follow above. Damping has no end: it approaches zero asymptotically, so
 * leaving the city left a bulge decaying for as long as anyone watched,
 * with no moment of arrival. A timed ease puts the city back down and
 * stops.
 *
 * Shares `easeInOutCubic` with the camera transform and the year morph,
 * so everything in the scene that settles, settles on one curve.
 */
const SWELL_SETTLE_MS = 300;

/**
 * R3F's camera type and the installed @types/three describe the same
 * object but are not assignable to one another, so narrow on three's own
 * runtime flag from `unknown` rather than casting between them.
 */
function asCamera(camera: unknown): THREE.Camera | null {
  const candidate = camera as THREE.Camera | null;
  return candidate?.isCamera === true ? candidate : null;
}

/** Future tiles sit slightly lower than a zero-contribution ground tile,
 * reading as an empty lot rather than a day with no activity. */
const FUTURE_TILE_HEIGHT_SCALE = 0.45;

/**
 * Instances the mesh is built to hold, independent of how many any one
 * period needs.
 *
 * An InstancedMesh allocates its buffers at construction, so sizing it to
 * the current period meant every year switch that changed the day count
 * -- a leap year, or the rolling window against a calendar one -- threw
 * the mesh away and built a new one. A fresh mesh has no instance colours
 * and no matrices, so it rendered white and unplaced for the frame or two
 * before they were written: the flash before the fade.
 *
 * Sized past the longest period there can be (a rolling window of 367
 * days), and `mesh.count` is set per frame to what is actually in use, so
 * the mesh survives every switch with its colours intact.
 */
const INSTANCE_CAPACITY = 384;

/** What the swell needs of the pointer: where it is, and whether it is
 * still on the page at all. */
type SwellPointer = { x: number; y: number; inside: boolean };

type BuildingLayout = {
  /** Null for padded future days, which are inert scaffolding. */
  day: ContributionDay | null;
  weekIndex: number;
  /** 0 = Sunday. Only the wave's diagonal treatment reads it. */
  weekday: number;
  x: number;
  z: number;
  restHeight: number;
  riseHeight: number;
  /** Rise-wave delay, used by the 3D spring release. */
  delayMs: number;
  /** Recolour-wave delay, used only in the flat state. */
  colorDelayMs: number;
  /** Delay before this column hands the wave over to the data. */
  settleDelayMs: number;
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
  /** While true the city runs the loading wave instead of showing data. */
  waving: boolean;
  /**
   * Pointer over the viewport, each axis normalized to -1..1. Null on a
   * device with no hovering pointer to answer at all.
   */
  swellPointerRef: RefObject<SwellPointer> | null;
  reducedMotion: boolean;
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
  waving,
  swellPointerRef,
  reducedMotion,
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
      // Scattered, not swept: each cell takes its own turn to flare and
      // resolve, so the data arrives the way the pulses do.
      const settleDelayMs =
        arrivalOrder(tile.weekIndex, tile.weekday) *
        config.waveArrivalSpreadMs;

      if (!tile.day) {
        const futureHeight = groundHeight * FUTURE_TILE_HEIGHT_SCALE;
        return {
          day: null,
          weekIndex: tile.weekIndex,
          weekday: tile.weekday,
          x,
          z,
          restHeight: futureHeight,
          riseHeight: futureHeight,
          delayMs,
          colorDelayMs,
          settleDelayMs,
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
        weekday: tile.weekday,
        x,
        z,
        restHeight: groundHeight,
        riseHeight: worldHeight(scaled, config.sceneMaxHeight),
        delayMs,
        colorDelayMs,
        settleDelayMs,
        color: new THREE.Color(
          contributionRampColor(normalized, day.count > 0),
        ),
      };
    });
    // Depend on the specific values used, not the whole config object.
    // Orbiting writes the camera angles back into config several times a
    // second; on the whole object that would rebuild every building and
    // reallocate the spring state mid-animation.
  }, [
    tiles,
    weekCount,
    config.cellGap,
    config.sceneMaxHeight,
    config.groundTileHeight,
    config.heightScale,
    config.staggerTotalMs,
    config.staggerCurve,
    config.colorStaggerMs,
    config.waveArrivalSpreadMs,
  ]);

  /**
   * Buffer size for the mesh. Only ever grows, so a period longer than
   * the constant costs one remount rather than one per switch.
   *
   * Adjusted during render rather than in an effect: React re-runs the
   * component immediately with the new value and discards this pass, so
   * the mesh is never built at the wrong size even for one frame.
   */
  const [capacity, setCapacity] = useState(INSTANCE_CAPACITY);
  if (layout.length > capacity) setCapacity(layout.length);

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
  /** Seconds the wave has been running, so it advances at a rate rather
   * than a frame count. */
  const waveElapsedRef = useRef(0);
  /** Milliseconds into the wave's decay, once the search has resolved. */
  const waveSettleRef = useRef(0);

  /**
   * Where the swell currently sits, in the mesh's own coordinates.
   *
   * Damping the *point* rather than each building's height is what keeps
   * this cheap: one lerp per frame instead of 366 springs, and the shape
   * of the bulge stays exactly the falloff curve rather than being
   * smeared by per-instance lag.
   */
  const swellPointRef = useRef({ x: 0, placed: false });
  /** Linear 0..1 clock for the rise and settle; eased where it is used. */
  const swellProgressRef = useRef(0);

  /** True while a period change is easing heights to their new targets.
   * Springs are reserved for the 2D/3D transform. */
  const morphingRef = useRef(false);
  /** True only for a 2D/3D rise, where columns are held at the ground
   * until their turn. Outside that, springs simply hold their target. */
  const staggeredRiseRef = useRef(false);

  const elapsedRef = useRef(0);
  const accumulatorRef = useRef(0);
  /**
   * Null rather than the initial target, so the very first frame counts
   * as a change and the city rises on load the way it rises from a
   * transform: held at the ground, released column by column.
   *
   * Seeded with `target` this was a no-op on mount, and the springs
   * simply pulled all 366 buildings up together the moment they were
   * created. The wave is the thing worth watching.
   */
  const lastTargetRef = useRef<number | null>(null);
  const lastRiseKeyRef = useRef(riseKey);

  // Layout effect, not a passive one. A passive effect runs after the
  // browser has painted, so between a period change and this running
  // there was a painted frame the loop had skipped -- it bails while the
  // buffers are the previous period's length.
  useLayoutEffect(() => {
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

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Where the swell is and how strong, resolved once per frame and
    // read by the write loop below.
    const swell = updateSwell(
      state.camera,
      mesh,
      swellPointerRef,
      swellPointRef.current,
      swellProgressRef,
      reducedMotion ? 0 : config.hoverSwellStrength,
      // Config gives the radius in columns; the falloff works in world
      // units, so it scales with the gap like everything else does.
      config.hoverSwellRadius * (CELL_SIZE + config.cellGap),
      delta,
    );

    // Draw only the instances this period uses. The rest of the buffer
    // stays allocated and untouched, ready for a longer year.
    if (mesh.count !== layout.length) mesh.count = layout.length;

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
      // A period change morphs; only a change of direction springs.
      morphingRef.current = periodChanged && !directionChanged && target === 1;
      staggeredRiseRef.current = directionChanged && target === 1;

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
      //
      // The *rendered* heights, not the stored ones. The swell is applied
      // at write time and never enters `heights`, so snapshotting those
      // dropped every raised building back to its true height on the
      // first frame of the flatten and then eased down from there. The
      // descent has to begin from what is on screen.
      const flattenFrom = heights.slice();
      if (target === 0) {
        for (let i = 0; i < layout.length; i++) {
          flattenFrom[i] = swelledHeight(flattenFrom[i], layout[i], swell);
        }
      }
      flattenFromRef.current = flattenFrom;
    }

    // Under orthographic projection a straight-down camera shows no
    // height whatsoever, so a wave that plays while the camera is still
    // overhead is invisible. Hold the clock until the tilt is readable.
    if (!riseStartedRef.current && progressRef.current >= config.riseStartProgress) {
      riseStartedRef.current = true;
    }
    if (riseStartedRef.current) elapsedRef.current += delta * 1000;
    const elapsed = elapsedRef.current;

    // The wave outlives the search by WAVE_SETTLE_MS, fading its own
    // amplitude out. Handing straight over left the grid at whatever
    // phase the sine had reached, half of it darker than any real day.
    // Held until the camera is nearly flat. A search from a standing
    // city starts the flatten and the search together, and a wave that
    // began straight away ran under a camera still on its way down --
    // two motions at once, neither of them legible. Expressed as
    // transform progress rather than a timer, so it tracks
    // `transformDurationMs` on its own and is already satisfied when the
    // search starts from the flat view.
    const waveRunning = waving && progressRef.current <= config.waveStartProgress;

    // The handover runs until the *last* column has finished, not the
    // first: with a sweep, the far side is still waving long after the
    // near side has become data.
    const settleTotalMs =
      WAVE_SETTLE_MS + Math.max(0, config.waveArrivalSpreadMs);
    const settling =
      !waving && waveElapsedRef.current > 0 && waveSettleRef.current < settleTotalMs;

    if (waveRunning || settling) {
      // Picking up an in-flight flatten: the eased descent has been
      // running without the wave, so continue from where it reached
      // rather than from the heights the transform started at.
      if (waveElapsedRef.current === 0) flattenFromRef.current.set(heights);

      // A search is in flight. The wave is purely a colour wave: it only
      // ever runs in the flat state, where an orthographic camera looking
      // straight down renders no height at all, so driving height here
      // would be work nobody can see.
      //
      // Heights instead ease to the ground on the flatten's own budget,
      // because the search is what flattened the city in the first place
      // and that descent is still readable through the tilt.
      waveElapsedRef.current += delta;
      waveSettleRef.current = waveRunning
        ? 0
        : waveSettleRef.current + delta * 1000;

      // Each tile crosses from the wave straight to its own colour, on
      // its column's own schedule. Two things follow from that: no
      // intermediate state the whole grid shares, so the chart is never
      // uniformly anything, and the crossing sweeps rather than
      // happening everywhere at once.
      const settleElapsed = waveRunning ? -1 : waveSettleRef.current;

      const waveShape = {
        front: config.waveFront,
        diagonal: config.waveDiagonal,
        sharpFront: config.waveSharpFront,
        twinkle: config.waveTwinkle,
        twinkleShare: config.waveTwinklePercent / 100,
      };
      const colors = colorsRef.current;
      const elapsedSeconds = waveElapsedRef.current;
      const descent = easeInOutCubic(
        Math.min(
          1,
          (elapsedSeconds * 1000) / Math.max(1, config.flattenDurationMs),
        ),
      );
      const from = flattenFromRef.current;

      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        const amount = reducedMotion
          ? 0.5
          : waveValueAt(
              item.weekIndex,
              item.weekday,
              elapsedSeconds,
              waveShape,
            );

        // This cell's turn to arrive, 0..1 across its own window.
        const arrival =
          settleElapsed < 0
            ? 0
            : Math.min(
                1,
                Math.max(0, settleElapsed - item.settleDelayMs) /
                  WAVE_SETTLE_MS,
              );

        // The pulse keeps running while the cell arrives, so what is on
        // screen mid-window is a blend of the live pulse and the real
        // value: the pulsing visibly settles into the data rather than
        // being replaced by it.
        //
        // Deliberately no flare to full. Forcing every cell bright first
        // lights days that have nothing on them, which is wrong for a
        // sparse year and worst for an empty one -- 371 cells flashing
        // green and resolving to blank. The cell travels from whatever
        // its pulse is doing straight to whatever it holds, so the same
        // arrival works at any density.
        const resolve = easeInOutCubic(arrival);

        // Footprint follows the raw amount, not the stepped colour: the
        // contrast between snapping colour and smooth breathing is the
        // point. Released back to a full cell as the cell arrives, so the
        // data never lands on a shrunken tile.
        const footprint = config.wavePulseScale
          ? 1 - (1 - WAVE_MIN_FOOTPRINT) * (1 - amount) * (1 - resolve)
          : 1;

        heights[i] = from[i] + (item.restHeight - from[i]) * descent;
        velocities[i] = 0;
        writeInstance(mesh, i, item, heights[i], footprint);

        // The wave keeps running through the settle, so the chart
        // resolves in motion rather than freezing and then fading.
        scratchColor.set(waveLevelColor(amount));
        if (resolve > 0) scratchColor.lerp(item.color, resolve);

        const base = i * 3;
        colors[base] = scratchColor.r;
        colors[base + 1] = scratchColor.g;
        colors[base + 2] = scratchColor.b;
      }

      mesh.instanceMatrix.needsUpdate = true;
      writeColors(mesh, colors, layout.length);

      // The wave overwrote every colour, so whatever the next period is,
      // it has to fade from here rather than from the old data.
      colorFromRef.current.set(colors);
      return;
    }

    // Leaving the wave. The settle has already carried every tile to its
    // own colour, so there is nothing left to fade -- claiming otherwise
    // would restart an 800ms fade from the answer to the answer.
    if (waveElapsedRef.current > 0) {
      waveElapsedRef.current = 0;
      waveSettleRef.current = 0;
      colorFadingRef.current = false;

      // Only claim the height bookkeeping if a rise is not already under
      // way. If the view flipped to 3D while cells were still arriving,
      // the direction change has already set the hold heights, zeroed the
      // clock and armed the stagger — and overwriting that here turned
      // the sprung rise into an eased morph, which is the flash: every
      // building jumping toward its height with no stagger and no spring
      // before the real rise took over.
      if (!staggeredRiseRef.current) {
        holdHeightsRef.current.set(heights);
        flattenFromRef.current.set(heights);
        morphingRef.current = target === 1;
        elapsedRef.current = 0;
      }
    }

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

    if (morphingRef.current) {
      // Changing period: ease to the new heights instead of springing,
      // and move every building together. A bounce here would read as
      // the data being unstable, and a wave would draw attention to the
      // transition rather than to the year that replaced it.
      const duration = Math.max(1, config.yearMorphMs);
      const progress = elapsed / duration;
      // Unstaggered, so the curve is the same for every building and is
      // evaluated once rather than per instance.
      const eased = easeInOutCubic(progress);

      for (let i = 0; i < layout.length; i++) {
        const item = layout[i];
        const from = holdHeightsRef.current[i];

        heights[i] = from + (item.riseHeight - from) * eased;
        velocities[i] = 0;
        // Swelled here too: the city is standing throughout a year
        // change, so a bulge under the pointer should survive it rather
        // than collapse and come back.
        writeInstance(mesh, i, item, swelledHeight(heights[i], item, swell));
      }

      mesh.instanceMatrix.needsUpdate = true;
      morphingRef.current = progress < 1;
    } else {
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
        // Held at rest until this column's turn -- but only during a
        // rise. Once a morph hands back, elapsed has been reset and
        // columns whose delay it has not yet passed would be targeted at
        // the previous period's height, so the spring would haul them
        // backwards and then forwards again: a bounce on a year change,
        // which is exactly what the morph exists to avoid.
        const springTarget = staggeredRiseRef.current
          ? riseStartedRef.current && elapsed >= item.delayMs
            ? item.riseHeight
            : holdHeightsRef.current[i]
          : item.riseHeight;

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

    // The only branch the swell applies to: a city standing still is
    // the one you can hover over. During a transform, a year morph or the
    // loading wave the heights are already telling a story, and a second
    // one on top reads as interference.
    //
    // It scales what is written rather than the spring state itself, so
    // the physics never has to know about it and nothing drifts.
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      writeInstance(mesh, i, item, swelledHeight(heights[i], item, swell));
    }
    mesh.instanceMatrix.needsUpdate = true;
    }

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
  // Before paint, so a mesh that genuinely was rebuilt never shows its
  // default white.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.count = layout.length;
    writeColors(mesh, colorsRef.current, layout.length);
  }, [layout]);

  // No raycast bounding sphere: nothing hovers the mesh any more. The
  // scene has no pointer handlers, so R3F never tests it.

  return (
    <instancedMesh
      ref={meshRef}
      // Deliberately not keyed on the day count. A fixed capacity plus a
      // per-frame `count` keeps one mesh alive across every period, so a
      // year switch fades from the colours already on screen instead of
      // from a blank mesh.
      key={capacity}
      args={[undefined, undefined, capacity]}
      castShadow
      receiveShadow
    >
      <primitive object={geometry} attach="geometry" />
      <meshLambertMaterial />
    </instancedMesh>
  );
}

type Swell = {
  /**
   * Centre on the column axis, in the mesh's own coordinates. There is no
   * z: the ridge spans the full depth, so where the pointer sits between
   * Sunday and Saturday makes no difference.
   */
  x: number;
  /** Peak extra height as a fraction, already faded. 0 means inactive. */
  amount: number;
  /** Falloff distance in world units. */
  radius: number;
};

/**
 * Moves the swell toward the pointer and returns this frame's state.
 *
 * The pointer arrives as viewport coordinates, which say nothing about
 * where the city is: the camera tilts, and the parallax group rotates the
 * city underneath it. So the pointer is unprojected into a world ray, met
 * with the ground plane, and converted into the mesh's own space — which
 * is the space the instances are positioned in, so the comparison is then
 * a plain distance.
 */
function updateSwell(
  rawCamera: unknown,
  mesh: THREE.InstancedMesh,
  pointerRef: RefObject<SwellPointer> | null,
  point: { x: number; placed: boolean },
  progressRef: { current: number },
  strength: number,
  radius: number,
  delta: number,
): Swell {
  const camera = asCamera(rawCamera);
  // `inside` matters as much as the rest: a pointer that has left the
  // document keeps its last coordinates, so without it the swell has no
  // way to tell hovering still from having been abandoned.
  const available =
    strength > 0 &&
    radius > 0 &&
    camera !== null &&
    pointerRef !== null &&
    pointerRef.current.inside;

  if (available) {
    // Viewport coords to NDC. The y axis flips: the pointer is measured
    // downward from the top, clip space upward from the centre.
    const pointer = pointerRef.current;
    scratchPointer.set(pointer.x, -pointer.y, -1).unproject(camera);
    camera.getWorldDirection(scratchDirection);

    // Meet the ground plane. Guard the grazing case, where the camera
    // looks along the plane and the intersection runs off to infinity.
    if (Math.abs(scratchDirection.y) > 1e-4) {
      scratchPointer.addScaledVector(
        scratchDirection,
        -scratchPointer.y / scratchDirection.y,
      );
      mesh.worldToLocal(scratchPointer);

      if (point.placed) {
        // Frame-rate independent damping: the same trail at 60 and 120fps.
        const blend = 1 - Math.exp(-SWELL_FOLLOW_LAMBDA * delta);
        point.x += (scratchPointer.x - point.x) * blend;
      } else {
        // First placement jumps, or the swell would sweep in from the
        // origin the first time the pointer moves.
        point.x = scratchPointer.x;
        point.placed = true;
      }
    }
  }

  // A linear clock toward the target, eased on the way out. Advancing
  // the eased value directly would ease an already-eased position and
  // the curve would flatten every time the direction changed; this way
  // reversing mid-settle simply runs the same curve backwards from
  // wherever it had got to.
  const target = available && point.placed ? 1 : 0;
  const step = delta / (SWELL_SETTLE_MS / 1000);
  const progress = progressRef.current;
  progressRef.current =
    target > progress
      ? Math.min(target, progress + step)
      : Math.max(target, progress - step);

  // Fully down: only now forget where the pointer was, so a cursor that
  // comes back mid-settle resumes from the bulge still on screen rather
  // than teleporting it across the city.
  if (progressRef.current === 0) point.placed = false;

  return {
    x: point.x,
    amount: easeInOutCubic(progressRef.current) * strength,
    radius,
  };
}

/** A building's height as actually rendered, with the hover swell on it. */
function swelledHeight(
  height: number,
  item: BuildingLayout,
  swell: Swell,
): number {
  return swell.amount > 0
    ? height * (1 + swell.amount * falloff(item, swell))
    : height;
}

/**
 * How much of the swell a building gets, 0..1.
 *
 * Measured along the column axis only, so every day in a week is lifted
 * by the same amount and the swell is a ridge running the depth of the
 * grid rather than a dome centred on one tile.
 *
 * The two axes are not the same kind of thing. Columns are time; rows are
 * weekday. A radial falloff treats them as interchangeable distances,
 * which quietly claims that three weeks away and three weekdays away are
 * comparable quantities — but weekday is a category, not a magnitude. A
 * ridge says "this stretch of the year", which the data supports. It also
 * measures space the same way the loading wave does.
 *
 * A Gaussian, so the ridge has no edge — a linear or clamped falloff
 * leaves a visible seam where the effect stops, which reads as a bug
 * rather than as a curve.
 */
function falloff(item: BuildingLayout, swell: Swell): number {
  const dx = item.x - swell.x;
  return Math.exp(-(dx * dx) / (swell.radius * swell.radius));
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
  /** Footprint as a fraction of a cell. Only the wave's pulse-scale
   * treatment passes anything but 1 — it is the one channel besides
   * colour that a straight-down camera can actually see. */
  footprint = 1,
) {
  const height = Math.max(rawHeight, 0.001);
  const width = CELL_SIZE * footprint;
  scratchPosition.set(item.x, height / 2, item.z);
  scratchScale.set(width, height, width);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
  mesh.setMatrixAt(index, scratchMatrix);
}
