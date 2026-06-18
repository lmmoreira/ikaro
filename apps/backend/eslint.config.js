const baseConfig = require('@ikaro/config/eslint-base');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '\\/ports(\\/index)?$',
              message: 'Import directly from the port file, e.g. ./ports/tenant-repository.port',
            },
            {
              regex: '\\/shared\\/domain(\\/index)?$',
              message: 'Import directly from the domain file, e.g. ../shared/domain/domain-event',
            },
          ],
        },
      ],
    },
  },
];
