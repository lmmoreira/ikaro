import type { Config } from 'jest';

const sharedTransform = {
  '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.test.json' }],
};

const config: Config = {
  rootDir: 'src',
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.integration.spec.ts',
    '!**/migrations/**',
    '!**/main.ts',
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['lcov', 'text-summary'],
  projects: [
    {
      displayName: 'unit',
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.spec\\.ts$',
      testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
      transform: sharedTransform,
      testEnvironment: 'node',
    },
    {
      displayName: 'integration',
      moduleFileExtensions: ['js', 'json', 'ts'],
      rootDir: 'src',
      testRegex: '.*\\.integration\\.spec\\.ts$',
      transform: sharedTransform,
      testEnvironment: 'node',
      testTimeout: 60000,
    },
  ],
};

export default config;
