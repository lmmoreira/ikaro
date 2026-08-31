const baseConfig = require('@ikaro/config/eslint-base');
const nextPlugin = require('@next/eslint-plugin-next');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const vitestPlugin = require('@vitest/eslint-plugin');
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
// TD37-S23: pre-pr.sh's E2E-1/E2E-2/E2E-3 checks (scripts/pre-pr.sh) ran once, before a PR was
// first created, and never again — a violation introduced in a later bot-fix-round commit was
// invisible to every gate after that (PR #429/M20-S08 shipped a real E2E-1 violation this way;
// docs/CI_TRAPS.md). Migrated to ESLint so ci:fast (and every push) catches a violation, not just
// the one pre-pr.sh run before a PR exists.
// E2E-1 matches any xxx.getByLabel(...)/xxx.getByText(...) member call — both are forbidden in
// e2e specs because they match against translatable copy, which breaks under i18n
// (docs/08-TESTING_STRATEGY.md § E2E Selector Strategy). Matches the dotted form
// (page.getByText(...)), computed-literal access (page['getByText'](...)) — same bypass class
// already fixed for RAW_FETCH_SELECTOR above (window['fetch'](...), Codex review, PR #375, round
// 2): a computed member's property is a Literal node with a `.value`, not an Identifier with a
// `.name`, so callee.property.name alone never matches it — and a bare destructured call
// (const { getByText } = page; getByText(...)), which the retired pre-pr.sh grep's plain
// substring match still caught but a member-only selector doesn't (Codex review, PR #450, round
// 2).
const E2E1_SELECTOR = {
  selector:
    "CallExpression:matches([callee.property.name=/^(getByLabel|getByText)$/], [callee.computed=true][callee.property.type='Literal'][callee.property.value=/^(getByLabel|getByText)$/], [callee.type='Identifier'][callee.name=/^(getByLabel|getByText)$/])",
  message:
    'E2E-1 (TD37-S23): getByLabel()/getByText() break under i18n — use a data-testid selector instead (docs/08-TESTING_STRATEGY.md § E2E Selector Strategy).',
};
// E2E-2 bans an ISO date (YYYY-MM-DD) embedded directly in a data-testid string literal — a
// component change that shifts the rendered date silently breaks every e2e selector referencing
// it. Scoped to component definition sites (**/*.tsx below), not the e2e specs that consume the
// value — matches JSXAttribute value as a plain string Literal, the same shape the
// pre-pr.sh grep matched.
const E2E2_SELECTOR = {
  selector:
    "JSXAttribute[name.name='data-testid'][value.type='Literal'][value.value=/\\d{4}-\\d{2}-\\d{2}/]",
  message:
    'E2E-2 (TD37-S23): no ISO date embedded in data-testid — encode it in a separate data-date attribute instead (docs/08-TESTING_STRATEGY.md).',
};
// E2E-3 bans a template-literal data-testid value (computed or not) — a computed testid forces
// every consuming e2e spec to reconstruct the same computation just to select the element.
// Encode the dynamic part in a separate data-* attribute and keep data-testid static. Descendant
// combinator (not a direct-child `>`) so a template literal nested inside a conditional/logical
// expression — e.g. data-testid={condition ? `row-${date}` : 'row'} — is still caught; a
// direct-child selector only matched a template literal as the JSXExpressionContainer's
// immediate expression (Codex review, PR #450).
const E2E3_SELECTOR = {
  selector: "JSXAttribute[name.name='data-testid'] JSXExpressionContainer TemplateLiteral",
  message:
    'E2E-3 (TD37-S23): no template-literal data-testid — encode the dynamic part in a separate data-* attribute and keep data-testid static (docs/08-TESTING_STRATEGY.md).',
};
// E2E-2/E2E-3 join NON_FETCH_SELECTORS (not their own block) specifically so they inherit the
// existing **/*.spec.ts/**/*.spec.tsx ignores below — their rationale (Playwright e2e-selector
// stability) doesn't apply to a Vitest-only unit-test mock component (TD37-S23 discovery note:
// apps/web/shells/hotsite/components/TestimonialsCarousel.spec.tsx's own template-literal
// data-testid is exactly this case). A *separate* block scoped to **/*.tsx would silently
// replace, not add to, this block's no-restricted-syntax entry for every .tsx file both blocks
// match — ESLint flat config replaces same-rule-key options per file, it doesn't merge them (see
// this file's own "Six rules share one block" comment below, and
// apps/backend/eslint.config.js's TD24-S03 comment, for the same trap already documented twice).
const NON_FETCH_SELECTORS = [
  LOCALE_LITERAL_SELECTOR,
  CSS_PROPERTIES_RETURN_SELECTOR,
  CSS_PROPERTIES_ARROW_SELECTOR,
  CSS_PROPERTIES_BARE_SELECTOR,
  ZOD_UUID_SELECTOR,
  ZOD_EMAIL_SELECTOR,
  E2E2_SELECTOR,
  E2E3_SELECTOR,
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
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@next/next': nextPlugin },
    rules: Object.fromEntries(
      Object.keys(nextPlugin.configs.recommended.rules).map((ruleName) => [ruleName, 'error']),
    ),
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
  // TD37-S23: E2E-1 only — scoped to Playwright e2e specs themselves, which the two
  // no-restricted-syntax blocks above deliberately ignore (**/*.spec.ts). A separate block is
  // required here rather than folding this into NON_FETCH_SELECTORS: e2e specs are exactly the
  // files those blocks exclude, so a rule meant to apply *only there* can't live in either.
  {
    files: ['e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': ['error', E2E1_SELECTOR],
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
  // TD37-S15: no .skip()/.only() — a skipped test hides a real regression behind a green CI
  // run, and a focused describe/it silently stops every sibling test in the file from running
  // at all. Scoped to spec files only; zero baseline violations confirmed repo-wide before this
  // shipped directly as `error` (docs/ANTI_PATTERNS.md, docs/08-TESTING_STRATEGY.md).
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
    },
  },
];
