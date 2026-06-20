import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
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
      include: ['lib/**', 'app/**', 'components/**', 'providers/**'],
      exclude: ['**/*.spec.*', '**/node_modules/**', '**/.next/**'],
    },
  },
  resolve: {
    alias: {
      // Module-level side effects: both modules run infra code at import time — always swap globally
      'next/font/google': path.resolve(__dirname, '__mocks__/next-font-google.ts'),
      'next/image': path.resolve(__dirname, '__mocks__/next-image.ts'),
    },
  },
});
