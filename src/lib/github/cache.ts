import "server-only";
import type { ContributionResponse } from "@/lib/contributions/types";

const SUCCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
const NOT_FOUND_TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry =
  | { kind: "success"; data: ContributionResponse; expiresAt: number }
  | { kind: "not-found"; expiresAt: number };

/**
 * In-memory cache, keyed by normalized username.
 *
 * This is a best-effort, single-process cache: it survives across
 * requests within one running server (and, via globalThis, across
 * Next.js dev-mode Fast Refresh reloads), but has no effect across
 * separate serverless function instances or cold starts in production.
 * That's an accepted MVP limitation — swap in Redis/Vercel KV if the
 * deployment target needs cross-instance caching.
 */
const globalForCache = globalThis as unknown as {
  __contributionCache?: Map<string, CacheEntry>;
};
const cache: Map<string, CacheEntry> =
  globalForCache.__contributionCache ?? new Map();
globalForCache.__contributionCache = cache;

function readValid(username: string): CacheEntry | undefined {
  const entry = cache.get(username);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(username);
    return undefined;
  }
  return entry;
}

export function getCachedSuccess(username: string): ContributionResponse | undefined {
  const entry = readValid(username);
  return entry?.kind === "success" ? entry.data : undefined;
}

export function isCachedNotFound(username: string): boolean {
  return readValid(username)?.kind === "not-found";
}

export function cacheSuccess(username: string, data: ContributionResponse): void {
  cache.set(username, {
    kind: "success",
    data,
    expiresAt: Date.now() + SUCCESS_TTL_MS,
  });
}

export function cacheNotFound(username: string): void {
  cache.set(username, {
    kind: "not-found",
    expiresAt: Date.now() + NOT_FOUND_TTL_MS,
  });
}
