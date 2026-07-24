import type { Config } from 'jest';

// Typed explicitly so the tuple ['ts-jest', options] satisfies [string, unknown]
// at both the project and top-level config sites (needed for globalSetup transform).
const sharedTransform: NonNullable<Config['transform']> = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
};

const config: Config = {
  rootDir: 'src',
  testTimeout: 60000,
  // Top-level transform enables ts-jest for globalSetup/globalTeardown TypeScript files
  transform: sharedTransform,
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.integration.spec.ts',
    '!**/migrations/**',
    '!**/main.ts',
    // Same category as main.ts — a side-effecting bootstrap file required before Nest/anything
    // else initialises (M17-S33), not a unit of testable logic.
    '!**/tracing.ts',
    // Same category: a standalone TypeORM CLI entry point that throws at import time if
    // required env vars are missing (M17-S27) — the testable logic it delegates to
    // (Cloud SQL Connector wiring, TD33) lives in cloud-sql-connector.adapter.ts and
    // env.validation.ts, both covered on their own.
    '!**/shared/database/data-source.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['lcov', 'text-summary'],
  coverageThreshold: {
    global: {
      statements: 85,
      branches: 80,
      functions: 85,
      lines: 85,
    },
  },
  projects: [
    {
      displayName: 'unit',
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
      testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$', '/migrations/'],
      transform: sharedTransform,
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.integration\\.spec\\.ts$',
      testPathIgnorePatterns: ['/migrations/'],
      transform: sharedTransform,
      testEnvironment: 'node',
      // Single container set shared across all integration test files — must run sequentially
      // to avoid concurrent Pub/Sub subscription conflicts.
      maxWorkers: 1,
      globalSetup: '<rootDir>/test/integration-global-setup.ts',
      globalTeardown: '<rootDir>/test/integration-global-teardown.ts',
    },
  ],
};

export default config;
