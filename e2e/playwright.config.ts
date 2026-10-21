import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, "../server/.env"), quiet: true });
/** Throwaway database for e2e runs — wiped every time. Never point this at real data. */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? process.env.TEST_DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/aelitez_e2e$2");
if (!E2E_DATABASE_URL) throw new Error("Set E2E_DATABASE_URL (or TEST_DATABASE_URL in server/.env).");
const API_PORT = 4100;
const WEB_PORT = 8180;
export const WEB = `http://localhost:${WEB_PORT}`;
export const API = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB,
    // Uses the locally installed Chrome — no separate browser download needed.
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.PW_CHANNEL ?? "chrome" } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" }, grep: /@mobile/ },
  ],
  webServer: [
    {
      // Prepare the throwaway database first, then start the API against it.
      command: `node ${JSON.stringify(path.join(here, "prepare-db.mjs"))} && npx tsx src/index.ts`,
      cwd: path.resolve(here, "../server"),
      url: `${API}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: "development",
        LOG_LEVEL: "warn",
        CORS_ORIGINS: WEB,
        STOREFRONT_URL: WEB,
        PUBLIC_API_URL: API,
        COD_ENABLED: "true",
        DISABLE_JOBS: "true",
        RATE_LIMIT_MULTIPLIER: "50",
        E2E_DATABASE_URL,
        DATABASE_URL: E2E_DATABASE_URL,
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: path.resolve(here, ".."),
      url: WEB,
      timeout: 180_000,
      reuseExistingServer: false,
      env: { VITE_API_URL: API, VITE_SITE_URL: WEB },
    },
  ],
});
