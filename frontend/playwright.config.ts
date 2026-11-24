import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for accessibility, responsive layout, keyboard use and reduced motion.
 * They run against an already running app (the Compose stack by default), so start it first:
 *   BASE_URL=http://localhost:3000 npx playwright test
 * Unit tests stay in Vitest (src/**\/*.test.ts[x]).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
