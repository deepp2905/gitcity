import "server-only";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

type Bucket = { count: number; windowStart: number };

/** Same single-process caveat as cache.ts — a fixed-window limiter per
 * key (typically client IP), best-effort across serverless instances. */
const globalForThrottle = globalThis as unknown as {
  __contributionThrottle?: Map<string, Bucket>;
};
const buckets: Map<string, Bucket> =
  globalForThrottle.__contributionThrottle ?? new Map();
globalForThrottle.__contributionThrottle = buckets;

export type ThrottleResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export function checkThrottle(
  key: string,
  maxRequests = MAX_REQUESTS_PER_WINDOW,
  windowMs = WINDOW_MS,
): ThrottleResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count < maxRequests) {
    bucket.count += 1;
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfter: Math.ceil((bucket.windowStart + windowMs - now) / 1000),
  };
}
