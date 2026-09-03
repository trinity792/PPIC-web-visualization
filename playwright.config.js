/**
 * Playwright configuration for the visual-regression suite (Workstream F).
 *
 * The Vitest suite runs in jsdom, which has no layout engine and no canvas, so
 * it can assert that a Plotly figure object is correct but not that the picture
 * is. Line, Bar, Range, and Heatmap are the four approved baselines.
 *
 * Playwright stays separate from Vitest because it owns a browser process and a
 * production Next.js server. Use `npm run test:visual`; install Chromium once
 * with `npx playwright install chromium` on a new machine. Vitest's include
 * glob is `tests/js/**`, so nothing here affects `npm test`.
 *
 * Every source of nondeterminism a screenshot can pick up is pinned below:
 * browser, viewport, device scale, colour scheme, locale, timezone, animation,
 * and caret. The fixture data is pinned by the page itself, which reads
 * `tests/fixtures/visualization-v3/` rather than a live API.
 *
 * A baseline update is a review action. `--update-snapshots` is never the
 * response to a failing test on its own: someone looks at the diff first and
 * decides whether the new picture is the intended one.
 */

/* global process */

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3210);

export default defineConfig({
  testDir: "./tests/visual",
  snapshotDir: "./tests/visual/__screenshots__",
  // One worker: parallel Next.js compilation makes the first screenshot of each
  // route race the font load, which is exactly the kind of flake that gets a
  // baseline "updated" instead of read.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "github" : "list",

  expect: {
    toHaveScreenshot: {
      // Plotly renders text through the browser's own rasteriser, so a handful
      // of subpixel differences are expected and a pixel-exact threshold would
      // fail on every machine but the one that recorded the baseline.
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    // Number and date formatting reach axis ticks and hover labels.
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],

  webServer: {
    // A production build, not the dev server: dev-only overlays, HMR sockets,
    // and unminified fonts all move pixels.
    command: `npm run build && npx next start --port ${PORT}`,
    env: { VISUALIZATION_V3_TEST_FIXTURE: "1" },
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
