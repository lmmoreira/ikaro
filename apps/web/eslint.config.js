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
  // Exported component functions must declare an explicit return type — see
  // docs/CODE_STANDARDS.md. Next.js App Router special files (page/layout/loading/error/
  // template/default/not-found/global-error) are excluded: their default-export shape is
  // already validated by Next's own type generation (.next/types) against
  // PageProps/LayoutProps — annotating them manually fights that contract instead of
  // reinforcing it.
  {
    files: ['**/*.tsx'],
    ignores: [
      'app/**/page.tsx',
      'app/**/layout.tsx',
      'app/**/loading.tsx',
      'app/**/error.tsx',
      'app/**/template.tsx',
      'app/**/default.tsx',
      'app/**/not-found.tsx',
      'app/**/global-error.tsx',
    ],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'error' },
  },
  { ignores: ['next-env.d.ts'] },
  // global.d.ts uses empty interface extension for next-intl IntlMessages
  // augmentation (declaration merging) — a standard TypeScript pattern that
  // no-empty-object-type correctly flags but must be allowed here.
  {
    files: ['global.d.ts'],
    rules: { '@typescript-eslint/no-empty-object-type': 'off' },
  },
];
