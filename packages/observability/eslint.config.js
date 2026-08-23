const baseConfig = require('@ikaro/config/eslint-base');
const jestPlugin = require('eslint-plugin-jest');

// TD37-S15: this package's first ESLint config — previously unscanned by `pnpm lint` (no
// "lint" script existed). Inherits the same shared base every app already uses; the only rule
// added on top is the skip/only ban, scoped to spec files (docs/ANTI_PATTERNS.md,
// docs/08-TESTING_STRATEGY.md).
module.exports = [
  ...baseConfig,
  {
    files: ['src/**/*.spec.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
    },
  },
];
