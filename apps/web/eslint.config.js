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

// Every BFF/backend call must go through bffServerFetch/bffPublicFetch (server-only) or
// bffClient (client-only) — a raw fetch() duplicates base-URL construction, timeout policy, and
// cache defaults, and on the client it also misses withCredentials (docs/ANTI_PATTERNS.md,
// bad-smell-audit WEB-8). Reviewed exceptions come from architecture-policy.json's raw-fetch-web
// entries (the gateway Route Handler itself, local /api/** Route Handler proxies, signed-URL
// uploads, and approved external APIs). Matches a bare fetch(...) call and the same call
// qualified via window./globalThis./self. — both the dotted form (Codex review, PR #375, round 1:
// a bare-identifier-only selector let globalThis.fetch(...)/window.fetch(...) bypass the ban,
// since those resolve to the identical global Fetch API through a MemberExpression callee instead
// of an Identifier one) and the computed form (Codex review, PR #375, round 2:
// window['fetch'](...) still bypassed the round-1 fix — a computed member's property is a Literal
// node with a `.value`, not an Identifier with a `.name`, so callee.property.name never matched
// it).
const RAW_FETCH_SELECTOR = {
  selector:
    "CallExpression:matches([callee.name='fetch'], [callee.object.name=/^(window|globalThis|self)$/][callee.property.name='fetch'], [callee.object.name=/^(window|globalThis|self)$/][callee.property.value='fetch'])",
  message:
    'Raw fetch() bypasses the sanctioned BFF transport helpers. Use bffServerFetch/bffPublicFetch (server-only) or bffClient (client-only) instead, or add a reviewed raw-fetch-web entry to packages/architecture-check/architecture-policy.json (docs/ANTI_PATTERNS.md; bad-smell-audit WEB-8).',
};
// Protected-area layouts must read the locale from the decoded JWT, never hardcode it — a
// hardcoded locale silently ignores the tenant's configured language (M13-S15 incident;
// docs/ENGINEERING_RULES.md §RequestContext). resolveSupportedLocale(payload.locale ?? 'pt-BR') —
// a literal used only as the fallback — still passes; only a bare literal as the sole argument is
// banned. The selector itself (exact function name + single literal arg) is already narrow enough
// that scoping this block to every .ts/.tsx file is safe — no other call site in the repo calls
// resolveSupportedLocale() this way. Matches both a string literal and a no-substitution template
// literal (Codex review, PR #375: resolveSupportedLocale(`pt-BR`) is an equally hardcoded value
// but is a distinct TemplateLiteral AST node, not a Literal, so the original selector missed it —
// a template literal WITH interpolation, e.g. `${x}`, is excluded via expressions.length=0, since
// that's a genuinely dynamic value, not a hardcoded one).
const LOCALE_LITERAL_SELECTOR = {
  selector:
    "CallExpression[callee.name='resolveSupportedLocale'][arguments.length=1]:matches([arguments.0.type='Literal'], [arguments.0.type='TemplateLiteral'][arguments.0.expressions.length=0])",
  message:
    "Do not hardcode a locale string in a protected-area layout — read payload.locale ?? 'pt-BR' from the decoded JWT instead (docs/ENGINEERING_RULES.md §RequestContext; M13-S15 incident).",
};
// `as React.CSSProperties` on a function's returned value is an unnecessary assertion
// (SonarCloud) that also loses type precision on custom `--ba-*` keys — return
// `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).
// Three selectors cover: a namespaced `as React.CSSProperties` in a `return` statement, the same
// in an arrow function's expression body, and a bare (non-namespaced) `as CSSProperties` in
// either position — `import type { CSSProperties } from 'react'` produces a plain
// TSTypeReference, not the TSQualifiedName the first two selectors match (CodeRabbit review,
// PR #375).
const CSS_PROPERTIES_RETURN_SELECTOR = {
  selector:
    "ReturnStatement > TSAsExpression > TSTypeReference > TSQualifiedName[left.name='React'][right.name='CSSProperties']",
  message:
    "Don't cast a function's return value with `as React.CSSProperties` — return `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).",
};
const CSS_PROPERTIES_ARROW_SELECTOR = {
  selector:
    "ArrowFunctionExpression > TSAsExpression > TSTypeReference > TSQualifiedName[left.name='React'][right.name='CSSProperties']",
  message:
    "Don't cast a function's return value with `as React.CSSProperties` — return `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).",
};
const CSS_PROPERTIES_BARE_SELECTOR = {
  selector:
    ":matches(ReturnStatement, ArrowFunctionExpression) > TSAsExpression > TSTypeReference[typeName.name='CSSProperties']",
  message:
    "Don't cast a function's return value with `as CSSProperties` — return `React.CSSProperties & Record<`--ba-${string}`, string>` instead (docs/ANTI_PATTERNS.md).",
};
// Imported (not redefined) from @ikaro/config/eslint-base.js so the uuid/email selectors have one
// source of truth (CodeRabbit review, PR #375) — still repeated into this file's own blocks
// below, because ESLint flat config replaces, not merges, a rule's options per matching file.
const { ZOD_UUID_SELECTOR, ZOD_EMAIL_SELECTOR } = baseConfig;
const NON_FETCH_SELECTORS = [
  LOCALE_LITERAL_SELECTOR,
  CSS_PROPERTIES_RETURN_SELECTOR,
  CSS_PROPERTIES_ARROW_SELECTOR,
  CSS_PROPERTIES_BARE_SELECTOR,
  ZOD_UUID_SELECTOR,
  ZOD_EMAIL_SELECTOR,
];

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
  // Six rules share one block because ESLint flat config REPLACES (not merges) a
  // rule's options when two config objects both set it for the same file — a later block here
  // would silently discard an earlier block's no-restricted-syntax selectors for any file both
  // blocks match (see apps/backend/eslint.config.js's TD24-S03 comment for the same trap).
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'shared/lib/api/bff-server.ts',
      ...reviewedRawFetchPaths,
    ],
    rules: {
      'no-restricted-syntax': ['error', RAW_FETCH_SELECTOR, ...NON_FETCH_SELECTORS],
    },
  },
  // A reviewed raw-fetch-web exception exempts a file from the fetch ban ONLY — `ignores` above
  // applies to the whole block above, not to a single selector, so without this second block the
  // 10 reviewed files (including app/v1/[...path]/route.ts and features/booking/api/public.ts)
  // would also silently lose the locale/CSSProperties/Zod bans, which nobody reviewed an
  // exception for (CodeRabbit review, PR #375). Self-sufficient tier, same pattern as above.
  {
    files: reviewedRawFetchPaths,
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...NON_FETCH_SELECTORS],
    },
  },

  // TD37-S05: docs/CODE_STANDARDS.md's function/file length limits, enforced via ESLint core
  // (zero new dependency). Specs are exempt (test bodies are naturally longer due to setup/
  // assertions — the rule's intent targets production logic); e2e/helpers/** is exempt
  // (reusable Playwright flow helpers, not app production code, per CLAUDE.md §7 Testing).
  // .tsx gets its own, much higher max-lines-per-function threshold: ESLint counts JSX markup
  // as function body, so a component's render function isn't the same complexity signal as
  // equivalent-length imperative logic (discovery baseline, TD37-S05: web .ts violators had p90
  // 47/max 85, matching backend/BFF's .ts distribution; .tsx violators were structurally
  // different — median 49/p90 160/max 792).
  {
    files: ['**/*.ts'],
    ignores: ['**/*.spec.ts', 'e2e/helpers/**'],
    rules: {
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.tsx'],
    ignores: ['**/*.spec.tsx'],
    rules: {
      'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
    },
  },
];
