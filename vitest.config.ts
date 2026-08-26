import { defineConfig } from "vitest/config";

/**
 * Unit tests only, by design: pure logic (username parsing, contribution
 * period/date math, sqrt height normalization, GraphQL response mapping).
 * No component or E2E tooling is wired up — UI is verified manually.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
    },
  },
});
