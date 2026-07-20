import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/main.ts',
    // Same category as main.ts — a side-effecting bootstrap file required before Nest/anything
    // else initialises (M17-S33), not a unit of testable logic.
    '!**/tracing.ts',
    '!**/*.module.ts',
    '!**/test/**',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['lcov', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 95,
    },
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  testEnvironment: 'node',
};

export default config;
