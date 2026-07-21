import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: [
    '**/*.{ts,js}',
    '!**/*.spec.ts',
    // Side-effecting SDK bootstrap (M17-S33), same category as main.ts/tracing.ts in the apps —
    // not a unit of testable logic.
    '!**/otel-tracing.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['lcov', 'text-summary'],
};

export default config;
