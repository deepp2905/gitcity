"use client";

import { useEffect, useRef } from "react";

const HISTORY_LENGTH = 90;
const GRAPH_WIDTH = 90;
const GRAPH_HEIGHT = 28;
/** Frames above this are drawn at full bar height. */
const GRAPH_CEILING_FPS = 120;

/**
 * Live FPS readout and history graph.
 *
 * Deliberately measures with its own rAF loop rather than R3F's
 * useFrame, so it reports the browser's real frame rate — including
 * frames the renderer skipped — and keeps working while the scene is
 * idle. It writes straight to the DOM and a canvas, never to React
 * state, so watching performance can't itself cost a re-render.
 */
export function FpsMeter() {
  const valueRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const history = new Array<number>(HISTORY_LENGTH).fill(0);
    let writeIndex = 0;
    let framesThisSecond = 0;
    let lastSampleTime = performance.now();
    let rafId = 0;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d") ?? null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas && context) {
      canvas.width = GRAPH_WIDTH * dpr;
      canvas.height = GRAPH_HEIGHT * dpr;
      context.scale(dpr, dpr);
    }

    const styles = getComputedStyle(document.documentElement);
    const barColor = styles.getPropertyValue("--color-accent").trim() || "#216e39";
    const warnColor = styles.getPropertyValue("--color-danger").trim() || "#b5432a";

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);

      const barWidth = GRAPH_WIDTH / HISTORY_LENGTH;
      for (let i = 0; i < HISTORY_LENGTH; i++) {
        // Read oldest-first so the graph scrolls left to right.
        const fps = history[(writeIndex + i) % HISTORY_LENGTH];
        if (fps <= 0) continue;

        const scaled = Math.min(fps / GRAPH_CEILING_FPS, 1);
        const barHeight = Math.max(1, scaled * GRAPH_HEIGHT);
        context.fillStyle = fps < 30 ? warnColor : barColor;
        context.globalAlpha = fps < 30 ? 0.9 : 0.55;
        context.fillRect(
          i * barWidth,
          GRAPH_HEIGHT - barHeight,
          Math.max(barWidth - 0.5, 0.5),
          barHeight,
        );
      }
      context.globalAlpha = 1;
    }

    function tick(now: number) {
      framesThisSecond++;

      const elapsed = now - lastSampleTime;
      // Sample about ten times a second: frequent enough to see a stutter,
      // slow enough that the number stays readable.
      if (elapsed >= 100) {
        const fps = (framesThisSecond * 1000) / elapsed;
        history[writeIndex] = fps;
        writeIndex = (writeIndex + 1) % HISTORY_LENGTH;

        if (valueRef.current) {
          valueRef.current.textContent = String(Math.round(fps));
        }
        draw();

        framesThisSecond = 0;
        lastSampleTime = now;
      }

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-[var(--surface-translucent-border)] bg-[var(--surface-translucent)] px-2 py-1.5 shadow-[var(--shadow-soft)] backdrop-blur-md">
      <div className="flex items-baseline gap-1">
        <span
          ref={valueRef}
          className="min-w-[2.5ch] text-right text-sm font-semibold tabular-nums text-ink"
        >
          –
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
          fps
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
        className="rounded-sm bg-canvas/60"
      />
    </div>
  );
}
