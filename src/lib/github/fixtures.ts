import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ContributionResponse } from "@/lib/contributions/types";

/**
 * Offline development fixtures.
 *
 * With `USE_FIXTURES=true` set in .env.local, the API route serves saved
 * responses from /fixtures instead of calling GitHub. That keeps UI and
 * 3D-scene work off the network (and off the API rate limit) entirely.
 *
 * Fixtures are captured normalized responses, so they exercise exactly
 * the shape the client consumes. Refresh one by unsetting the flag and
 * re-running the request against the live API.
 */
export function fixturesEnabled(): boolean {
  return process.env.USE_FIXTURES === "true";
}

export async function readFixture(
  username: string,
): Promise<ContributionResponse | null> {
  // `username` is already validated against the strict GitHub username
  // pattern before it reaches here, so it cannot contain path separators
  // or traversal sequences. basename() is belt-and-braces.
  const safeName = path.basename(username.toLowerCase());
  const filePath = path.join(process.cwd(), "fixtures", `${safeName}.json`);

  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as ContributionResponse;
  } catch {
    return null;
  }
}
