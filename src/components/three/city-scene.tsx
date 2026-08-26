"use client";

import { useCallback, useRef, useState, type ComponentRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { ContributionDay, ContributionPeriod } from "@/lib/contributions/types";
import { formatDayLabel } from "@/lib/contributions/grid";
import { buildHeatmapGrid } from "@/lib/contributions/grid";
import { gridWidth } from "@/lib/three/layout";
import { pixelRatioCap } from "@/lib/three/webgl";
import { palette } from "@/lib/theme/palette";
import { CityBuildings } from "./city-buildings";

type CitySceneProps = {
  period: ContributionPeriod;
  reducedMotion: boolean;
  isMobile: boolean;
};

type Tooltip = { day: ContributionDay; x: number; y: number };

/** Framing that keeps the whole ribbon in view regardless of period
 * length: pull back proportionally to the grid's width. */
function cameraPositionFor(weekCount: number): [number, number, number] {
  const width = gridWidth(weekCount);
  const distance = Math.max(width * 0.62, 28);
  return [distance * 0.52, distance * 0.46, distance * 0.62];
}

export function CityScene({ period, reducedMotion, isMobile }: CitySceneProps) {
  // Derived from the component rather than importing three-stdlib, which
  // is only a transitive dependency here.
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { weekCount } = buildHeatmapGrid(period.days);
  const initialPosition = cameraPositionFor(weekCount);

  const handleHoverDay = useCallback(
    (day: ContributionDay | null, x: number, y: number) => {
      setTooltip(day ? { day, x, y } : null);
    },
    [],
  );

  const resetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  return (
    <div className="relative">
      <div
        className="h-[420px] w-full overflow-hidden rounded-xl border border-border bg-canvas sm:h-[520px]"
        // The canvas is decorative: the mounted 2D grid carries the same
        // information for assistive tech.
        aria-hidden="true"
      >
        <Canvas
          shadows={!isMobile}
          dpr={pixelRatioCap(isMobile)}
          camera={{ position: initialPosition, fov: 38, near: 0.1, far: 500 }}
          onPointerMissed={() => setTooltip(null)}
        >
          <color attach="background" args={[palette.canvas]} />

          <ambientLight intensity={1.6} />
          <directionalLight
            position={[24, 38, 18]}
            intensity={2.1}
            castShadow={!isMobile}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-60}
            shadow-camera-right={60}
            shadow-camera-top={40}
            shadow-camera-bottom={-40}
          />

          {/* Ground plane, slightly below the tiles so shadows land on it. */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.02, 0]}
            receiveShadow={!isMobile}
          >
            <planeGeometry args={[400, 400]} />
            <meshLambertMaterial color={palette.canvas} />
          </mesh>

          <CityBuildings
            days={period.days}
            weekCount={weekCount}
            reducedMotion={reducedMotion}
            transitionKey={period.id}
            onHoverDay={handleHoverDay}
          />

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            // Never let the camera drop below the horizon or flip over the top.
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.46}
            minDistance={Math.max(gridWidth(weekCount) * 0.28, 14)}
            maxDistance={Math.max(gridWidth(weekCount) * 1.1, 90)}
            target={new THREE.Vector3(0, 0, 0)}
          />
        </Canvas>
      </div>

      <button
        type="button"
        onClick={resetView}
        className="absolute right-3 top-3 min-h-11 rounded-lg border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-3 text-sm font-medium text-ink shadow-[var(--shadow-soft)] backdrop-blur-md transition-colors hover:bg-canvas-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Reset view
      </button>

      {tooltip ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-full rounded-md bg-ink px-2 py-1 text-xs font-medium tabular-nums text-white shadow-md"
          style={{ left: tooltip.x, top: tooltip.y - 10 }}
        >
          {formatDayLabel(tooltip.day)}
        </div>
      ) : null}
    </div>
  );
}
