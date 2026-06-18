const baseConfig = require('@ikaro/config/eslint-base');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');

module.exports = [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },
  { ignores: ['next-env.d.ts'] },
];
