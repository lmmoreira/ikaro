const baseConfig = require('@ikaro/config/eslint-base');
const jestPlugin = require('eslint-plugin-jest');

// Same shared base every package uses; the only rule added on top is the skip/only ban, scoped to
// spec files (docs/ANTI_PATTERNS.md, docs/TESTING_STRATEGY.md).
module.exports = [
  ...baseConfig,
  {
    files: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-disabled-tests': 'error',
      'jest/no-focused-tests': 'error',
    },
  },
];
