import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const playwrightEnvPath = path.resolve(__dirname, '.env.playwright.local');

loadDotenv({ path: playwrightEnvPath, quiet: true });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // TD38: deliberately NOT setting X-Web-Internal-Key here via extraHTTPHeaders. That option
    // applies to the whole browser context -- not just Playwright's own page.request.* API
    // calls, but every real fetch/XHR the page itself makes too. It broke the guest photo
    // upload and hotsite image upload flows: both PUT the file directly from the browser to a
    // GCS signed URL, and a signed URL's CORS preflight only allows the exact header set baked
    // into X-Goog-SignedHeaders -- an extra unsigned header made fake-gcs-server's (and real
    // GCS's) preflight reject the request with a 403 and no CORS headers at all, which Chrome
    // then reports as a generic "blocked by CORS policy" fetch failure (found by reproducing
    // the CI failure locally and inspecting the Playwright trace's network log, TD38 PR #298).
    // The 12 e2e/helpers/** files that call the BFF directly (bypassing the /v1 gateway, for
    // test-setup speed) instead pass X-Web-Internal-Key explicitly per call -- see
    // e2e/helpers/auth/shared.ts's WEB_INTERNAL_KEY export.
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webServer intentionally omitted — tests run against the already-running dev stack.
  // Local: docker compose -f docker/docker-compose.yml up -d && pnpm dev
  // CI: pr-e2e.yml starts the full stack before running Playwright (absorbed from M16-S06).
});
