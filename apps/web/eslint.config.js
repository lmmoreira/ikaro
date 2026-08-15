const baseConfig = require('@ikaro/config/eslint-base');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const architecturePolicy = require('../../packages/architecture-check/architecture-policy.json');

// `ignores` entries are glob patterns, not literal paths — a Next.js dynamic-route folder like
// `app/v1/[...path]/route.ts` has literal square brackets that a glob engine otherwise reads as
// a character class, silently failing to match the file it names. Escape them so the registry
// path is matched as a literal string.
const escapeGlobBrackets = (path) => path.replace(/[[\]]/g, '\\$&');

const reviewedRawFetchPaths = architecturePolicy.exceptions
  .filter((exception) => exception.rule === 'raw-fetch-web')
  .map((exception) => escapeGlobBrackets(exception.path.replace(/^apps\/web\//, '')));

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
  // TD37-S04: four rules share one block because ESLint flat config REPLACES (not merges) a
  // rule's options when two config objects both set it for the same file — a later block here
  // would silently discard an earlier block's no-restricted-syntax selectors for any file both
  // blocks match (see apps/backend/eslint.config.js's TD24-S03 comment for the same trap). This
  // also means this block must repeat @ikaro/config/eslint-base.js's repo-wide uuid/email
  // selectors (not imported — the base config exports a full config array, not individual rule
  // objects), or this block would silently drop them for every .ts/.tsx file in apps/web.
  //
  // 1) Every BFF/backend call must go through bffServerFetch/bffPublicFetch (server-only) or
  //    bffClient (client-only) — a raw fetch() duplicates base-URL construction, timeout policy,
  //    and cache defaults, and on the client it also misses withCredentials (docs/ANTI_PATTERNS.md,
  //    bad-smell-audit WEB-8). Reviewed exceptions come from architecture-policy.json's
  //    raw-fetch-web entries (the gateway Route Handler itself, local /api/** Route Handler
  //    proxies, signed-URL uploads, and approved external APIs).
  // 2) Protected-area layouts must read the locale from the decoded JWT, never hardcode it — a
  //    hardcoded locale silently ignores the tenant's configured language (M13-S15 incident;
  //    docs/ENGINEERING_RULES.md §RequestContext). resolveSupportedLocale(payload.locale ??
  //    'pt-BR') — a literal used only as the fallback — still passes; only a bare literal as the
  //    sole argument is banned. The selector itself (exact function name + single literal arg) is
  //    already narrow enough that scoping this block to every .ts/.tsx file is safe — no other
  //    call site in the repo calls resolveSupportedLocale() this way.
  // 3) `as React.CSSProperties` on a function's returned value is an unnecessary assertion
  //    (SonarCloud) that also loses type precision on custom `--ba-*` keys — return
  //    `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'shared/lib/api/bff-server.ts',
      ...reviewedRawFetchPaths,
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='fetch']",
          message:
            'Raw fetch() bypasses the sanctioned BFF transport helpers. Use bffServerFetch/bffPublicFetch (server-only) or bffClient (client-only) instead, or add a reviewed raw-fetch-web entry to packages/architecture-check/architecture-policy.json (docs/ANTI_PATTERNS.md; bad-smell-audit WEB-8).',
        },
        {
          selector:
            "CallExpression[callee.name='resolveSupportedLocale'][arguments.length=1][arguments.0.type='Literal']",
          message:
            "Do not hardcode a locale string in a protected-area layout — read payload.locale ?? 'pt-BR' from the decoded JWT instead (docs/ENGINEERING_RULES.md §RequestContext; M13-S15 incident).",
        },
        {
          selector:
            "ReturnStatement > TSAsExpression > TSTypeReference > TSQualifiedName[left.name='React'][right.name='CSSProperties']",
          message:
            "Don't cast a function's return value with `as React.CSSProperties` — return `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).",
        },
        {
          selector:
            "ArrowFunctionExpression > TSAsExpression > TSTypeReference > TSQualifiedName[left.name='React'][right.name='CSSProperties']",
          message:
            "Don't cast a function's return value with `as React.CSSProperties` — return `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).",
        },
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
