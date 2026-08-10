module.exports = [
  { name: 'backend', source: 'apps/backend/src', tsConfig: 'apps/backend/tsconfig.json' },
  { name: 'bff', source: 'apps/bff/src', tsConfig: 'apps/bff/tsconfig.json' },
  { name: 'web', source: 'apps/web', tsConfig: 'apps/web/tsconfig.json' },
  {
    name: 'env-validation',
    source: 'packages/env-validation/src',
    tsConfig: 'packages/env-validation/tsconfig.json',
  },
  {
    name: 'http-utils',
    source: 'packages/http-utils/src',
    tsConfig: 'packages/http-utils/tsconfig.json',
  },
  { name: 'i18n', source: 'packages/i18n/src', tsConfig: 'packages/i18n/tsconfig.json' },
  {
    name: 'infra-scripts',
    source: 'packages/infra-scripts/src',
    tsConfig: 'packages/infra-scripts/tsconfig.json',
  },
  {
    name: 'nestjs-http',
    source: 'packages/nestjs-http/src',
    tsConfig: 'packages/nestjs-http/tsconfig.json',
  },
  {
    name: 'observability',
    source: 'packages/observability/src',
    tsConfig: 'packages/observability/tsconfig.json',
  },
  { name: 'types', source: 'packages/types/src', tsConfig: 'packages/types/tsconfig.json' },
  {
    name: 'validation',
    source: 'packages/validation/src',
    tsConfig: 'packages/validation/tsconfig.json',
  },
];
