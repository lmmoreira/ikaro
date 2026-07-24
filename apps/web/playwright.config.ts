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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webServer intentionally omitted — tests run against the already-running dev stack.
  // Local: docker compose -f docker/docker-compose.yml up -d && pnpm dev
  // CI: pr-e2e.yml starts the full stack before running Playwright (absorbed from M16-S06).
});
