import { dampingCoefficient } from "./config";

/**
 * Damped-spring integration for the building rise.
 *
 * Springs must be stepped at a fixed timestep. Integrating with the raw
 * frame delta goes unstable when a frame is dropped: a large dt can send
 * velocity past the point of no return and a building shoots off screen.
 * So the frame's elapsed time is accumulated and consumed in fixed
 * substeps, with any remainder carried to the next frame.
 */

/** 120Hz substep: stable well below 30fps, cheap enough at 366 springs. */
export const SPRING_TIMESTEP_S = 1 / 120;

/**
 * Guards the "spiral of death": after a long stall (a background tab, a
 * blocking script) the accumulated time could demand hundreds of
 * substeps, which would stall the next frame too.
 */
export const MAX_ACCUMULATED_S = 0.25;

export type SpringSettings = {
  stiffness: number;
  /** 1 is critically damped; below 1 overshoots. */
  dampingRatio: number;
};

/**
 * Advances one spring by exactly `dt`. Semi-implicit Euler: velocity is
 * updated first and the new velocity drives position, which is markedly
 * more stable than the explicit form at the same step size.
 */
export function stepSpring(
  value: number,
  velocity: number,
  target: number,
  { stiffness, dampingRatio }: SpringSettings,
  dt: number,
): { value: number; velocity: number } {
  const damping = dampingCoefficient(stiffness, dampingRatio);
  const acceleration = (target - value) * stiffness - velocity * damping;

  const nextVelocity = velocity + acceleration * dt;
  return { value: value + nextVelocity * dt, velocity: nextVelocity };
}

/**
 * How long a column waits before its buildings start rising.
 *
 * `curve` reshapes the sweep without changing its total length: 1 is
 * linear, above 1 holds the early columns back so the wave accelerates
 * across the city, below 1 front-loads it.
 */
export function columnDelayMs(
  weekIndex: number,
  weekCount: number,
  totalMs: number,
  curve: number,
): number {
  if (weekCount <= 1) return 0;
  const t = Math.min(1, Math.max(0, weekIndex / (weekCount - 1)));
  return Math.pow(t, curve) * totalMs;
}
