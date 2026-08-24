// @ts-check
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const eslintCommentsPlugin = require('@eslint-community/eslint-plugin-eslint-comments');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

const singleRuleSuppressionRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require ESLint line suppressions to name exactly one rule',
    },
    schema: [],
    messages: {
      singleRule: 'ESLint suppressions must name exactly one rule.',
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const match = comment.value
            .trim()
            .match(/^eslint-disable-(?:next-line|line)\b([\s\S]*)$/);

          if (!match) {
            continue;
          }

          const rulesPart = match[1].split(/\s+--\s+/, 1)[0].trim();
          const ruleNames = rulesPart
            .split(',')
            .map((ruleName) => ruleName.trim())
            .filter(Boolean);

          if (ruleNames.length !== 1) {
            context.report({ node: null, messageId: 'singleRule', loc: comment.loc });
          }
        }
      },
    };
  },
};

// z.string().uuid()/.email() are deprecated in Zod v4 (SonarCloud S1874) and
// z.string().uuid() rejects non-RFC-4122 test UUIDs — use z.uuid()/z.email() directly
// (docs/ANTI_PATTERNS.md). `:has()` finds a z.string() call anywhere in the callee chain rather
// than requiring it to be the immediate parent call, so a refined chain like
// z.string().trim().email() or z.string().min(1).uuid() is still caught (CodeRabbit review,
// PR #375: the original exact-two-level-chain selector missed those). Exported as named
// properties (not just used inline below) so apps/backend and apps/web can import the same
// selector objects instead of each maintaining their own copy — see those configs' own
// no-restricted-syntax blocks for why they still need to repeat the definitions in their own
// rule arrays (ESLint flat config replaces, not merges, a rule's options per matching file).
const ZOD_UUID_SELECTOR = {
  selector:
    "CallExpression[callee.property.name='uuid']:has(CallExpression[callee.object.name='z'][callee.property.name='string'])",
  message:
    'z.string().uuid() is deprecated in Zod v4 and rejects non-RFC-4122 test UUIDs (SonarCloud S1874) — use z.uuid() directly (docs/ANTI_PATTERNS.md).',
};
const ZOD_EMAIL_SELECTOR = {
  selector:
    "CallExpression[callee.property.name='email']:has(CallExpression[callee.object.name='z'][callee.property.name='string'])",
  message:
    'z.string().email() is deprecated in Zod v4 (SonarCloud S1874) — use z.email() directly (docs/ANTI_PATTERNS.md).',
};

/** @type {import('eslint').Linter.Config[]} */
const config = [
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
      '@eslint-community/eslint-comments': eslintCommentsPlugin,
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
      // The upstream eslint-comments plugin has no rule for comma-separated directives.
      'ikaro-eslint-comments/single-rule': 'error',
      // docs/CODE_STANDARDS.md's default-parameter rule (SonarCloud S1788) — zero baseline
      // violations repo-wide (TD37-S05, 2026-08-17), ships as error immediately with no
      // exceptions needed. Faster feedback than waiting for the SonarCloud CI stage.
      'default-param-last': 'error',
      'no-restricted-syntax': ['error', ZOD_UUID_SELECTOR, ZOD_EMAIL_SELECTOR],
      // ESLint suppressions are allowed only for one line, one named rule, with a
      // concrete justification. File/block disables and enable directives are forbidden
      // (TD37-S16; docs/CODE_STANDARDS.md).
      '@eslint-community/eslint-comments/no-use': [
        'error',
        { allow: ['eslint-disable-line', 'eslint-disable-next-line'] },
      ],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
];

config[1].plugins['ikaro-eslint-comments'] = {
  rules: { 'single-rule': singleRuleSuppressionRule },
};

module.exports = config;
// Array spread (`...baseConfig`) only iterates numeric indices, so attaching named properties
// here doesn't leak into any config array that spreads this module — safe to piggyback on the
// same export.
module.exports.ZOD_UUID_SELECTOR = ZOD_UUID_SELECTOR;
module.exports.ZOD_EMAIL_SELECTOR = ZOD_EMAIL_SELECTOR;
