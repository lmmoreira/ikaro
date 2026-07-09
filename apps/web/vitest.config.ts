import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10_000,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.spec.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
    // components/hotsite specs run in jsdom — each spec file declares:
    //   // @vitest-environment jsdom
    // lib/** stays in the default node environment with no change.
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
      include: ['lib/**', 'app/**', 'components/**', 'providers/**', 'features/**'],
      exclude: [
        '**/*.spec.*',
        '**/node_modules/**',
        '**/.next/**',
        '**/app/**/page.tsx',
        '**/app/**/layout.tsx',
        'playwright.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      // Module-level side effects: these modules run infra code at import time — always swap globally.
      // next/link also causes Vite v8 import-analysis to reject JSX in vi.mock() factory closures
      // when the mock spans multiple lines, so it is aliased globally instead of per-file.
      'next/font/google': path.resolve(__dirname, '__mocks__/next-font-google.ts'),
      'next/image': path.resolve(__dirname, '__mocks__/next-image.ts'),
      'next/link': path.resolve(__dirname, '__mocks__/next-link.ts'),
      'client-only': path.resolve(__dirname, '__mocks__/client-only.ts'),
      'server-only': path.resolve(__dirname, '__mocks__/server-only.ts'),
    },
  },
});
