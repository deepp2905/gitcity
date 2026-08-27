/**
 * CSS cubic-bezier easing, evaluated in JavaScript.
 *
 * A CSS `cubic-bezier(x1, y1, x2, y2)` is a curve through (0,0) and (1,1)
 * parameterised by an internal `t` that is NOT the input. Evaluating it
 * means solving x(t) = input for t, then reading y(t) -- so it needs a
 * numeric solve rather than a closed-form polynomial.
 *
 * This is why the curve differs from the piecewise "ease in out cubic"
 * polynomial it replaced: they are similar in shape but not the same
 * function, and the Bezier is the one CSS and design tools mean.
 */

/** Newton-Raphson converges in a handful of steps over this range. */
const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_EPSILON = 1e-7;
const SUBDIVISION_ITERATIONS = 12;

function coefficients(a1: number, a2: number) {
  const c = 3 * a1;
  const b = 3 * (a2 - a1) - c;
  const a = 1 - c - b;
  return { a, b, c };
}

function sample(t: number, a1: number, a2: number): number {
  const { a, b, c } = coefficients(a1, a2);
  return ((a * t + b) * t + c) * t;
}

function slope(t: number, a1: number, a2: number): number {
  const { a, b, c } = coefficients(a1, a2);
  return (3 * a * t + 2 * b) * t + c;
}

/** Binary search fallback for the flat stretches Newton can't resolve. */
function subdivide(x: number, lower: number, upper: number, x1: number, x2: number) {
  let low = lower;
  let high = upper;
  let current = 0;
  let guess = 0;

  for (let i = 0; i < SUBDIVISION_ITERATIONS; i++) {
    guess = low + (high - low) / 2;
    current = sample(guess, x1, x2) - x;
    if (current > 0) high = guess;
    else low = guess;
    if (Math.abs(current) <= SUBDIVISION_EPSILON) break;
  }

  return guess;
}

/**
 * Builds an easing function matching a CSS `cubic-bezier(x1, y1, x2, y2)`.
 * Input is clamped to 0..1, so callers don't have to.
 */
export function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (t: number) => number {
  // A linear curve needs no solving, and would divide by a zero slope.
  if (x1 === y1 && x2 === y2) {
    return (t) => Math.min(1, Math.max(0, t));
  }

  return (input: number) => {
    const x = Math.min(1, Math.max(0, input));
    if (x === 0 || x === 1) return x;

    // Solve x(t) = x for t.
    let t = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const currentSlope = slope(t, x1, x2);
      if (currentSlope < NEWTON_MIN_SLOPE) {
        t = subdivide(x, 0, 1, x1, x2);
        break;
      }
      t -= (sample(t, x1, x2) - x) / currentSlope;
    }

    return sample(t, y1, y2);
  };
}
