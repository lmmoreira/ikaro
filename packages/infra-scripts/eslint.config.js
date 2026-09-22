const baseConfig = require('@ikaro/config/eslint-base');
const jestPlugin = require('eslint-plugin-jest');

// TD37-S15: this package's first ESLint config — previously unscanned by `pnpm lint` (no
// "lint" script existed). Inherits the same shared base every app already uses; the only new
// rule is the skip/only ban, scoped to spec files (docs/ANTI_PATTERNS.md,
// docs/08-TESTING_STRATEGY.md).
module.exports = [
  ...baseConfig,
  // infra-scripts is a standalone CLI tool with no NestJS/AppLogger — console.log/error is its
  // actual CLI output, not a debug leftover. Same rationale scripts/pre-pr.sh's check 17
  // already exempts this exact package for (M17-S18); this is the first time base config's
  // `no-console: 'error'` actually runs against this package's production source at all.
  {
    files: ['src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.spec.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
    },
  },
];
