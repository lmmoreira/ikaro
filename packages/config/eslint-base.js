// @ts-check
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended'].rules,
      ...prettierConfig.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'error',
      'no-console': 'error',
      'prettier/prettier': 'error',
      // TD37-S04: z.string().uuid()/.email() are deprecated in Zod v4 (SonarCloud S1874) and
      // z.string().uuid() rejects non-RFC-4122 test UUIDs — use z.uuid()/z.email() directly
      // (docs/ANTI_PATTERNS.md). Repo-wide because backend, BFF, web, and packages/* all
      // validate with Zod.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='uuid'][callee.object.callee.object.name='z'][callee.object.callee.property.name='string']",
          message:
            'z.string().uuid() is deprecated in Zod v4 and rejects non-RFC-4122 test UUIDs (SonarCloud S1874) — use z.uuid() directly (docs/ANTI_PATTERNS.md).',
        },
        {
          selector:
            "CallExpression[callee.property.name='email'][callee.object.callee.object.name='z'][callee.object.callee.property.name='string']",
          message:
            'z.string().email() is deprecated in Zod v4 (SonarCloud S1874) — use z.email() directly (docs/ANTI_PATTERNS.md).',
        },
      ],
    },
  },
];
