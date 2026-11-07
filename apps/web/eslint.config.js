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
// docs/ENGINEERING_RULES_SHARED.md §RequestContext). resolveSupportedLocale(payload.locale ?? 'pt-BR') —
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
    "Do not hardcode a locale string in a protected-area layout — read payload.locale ?? 'pt-BR' from the decoded JWT instead (docs/ENGINEERING_RULES_SHARED.md §RequestContext; M13-S15 incident).",
};
// NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL is the ORIGIN of the public image host, read only by the CSP
// (proxy.ts) and next/image's remotePatterns (next.config.ts). A saved image reaches the web as a
// full URL the backend resolved, so any other read is a web-side URL composition — which produced
// broken service images on every deployed environment, because Terraform sets the variable
// host-only while local and CI used a bucket-inclusive value (TD56-S07; docs/API_CONTRACTS.md
// § Stored objects in responses and requests). The variable's name is matched wherever it appears,
// so the three documented bypass shapes are covered by construction (docs/ENGINEERING_RULES_SHARED.md
// § `no-restricted-syntax` selectors must be checked): a computed literal (process.env['…'],
// getPublicEnv('…')) is a Literal; a template literal with no substitution is a TemplateElement;
// a dotted member, a destructured key and a shorthand binding are an Identifier. A variable that
// holds the name in a constant is the one shape a syntax selector cannot follow.
const IMAGE_BASE_URL_VARIABLE = 'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL';
const IMAGE_BASE_URL_SELECTOR = {
  selector: `:matches(Literal[value='${IMAGE_BASE_URL_VARIABLE}'], TemplateElement[value.cooked='${IMAGE_BASE_URL_VARIABLE}'], Identifier[name='${IMAGE_BASE_URL_VARIABLE}'])`,
  message:
    'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL is an origin for the CSP and next/image only — never compose a saved image URL from it. The backend returns every saved image as a full URL; render it as given (docs/API_CONTRACTS.md § Stored objects in responses and requests).',
};
// The only files that may name the variable: the CSP and image-host config, the runtime-env key
// list that injects it, and the shared test helper that stubs it.
const imageBaseUrlAllowedPaths = [
  'proxy.ts',
  'next.config.ts',
  'shared/lib/runtime-env/public-env.ts',
  'test-utils.tsx',
];
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
// A hand-drawn `role="alert"` / `role="status"` box skips the one feedback pattern (TD57): the
// shared components pick the role, the placement, the retry and the field marking, so a message
// that writes its own role is a message drawn outside that pattern. Only the two shared message
// components may write the role (feedbackRoleAllowedPaths below); a field message has no role at
// all (docs/ENGINEERING_RULES_FRONTEND.md § A form's error or success message lives in the action
// pane). The value test is shared by every shape, which covers the three documented bypass classes
// (docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax` selectors must be checked): a JSX
// attribute value is a Literal, a `role={'alert'}` / ternary value is a Literal nested in the
// expression container (descendant combinator), `role={`alert`}` is a TemplateElement, and a spread
// `{...{ role: 'alert' }}`, `createElement('div', { role: 'alert' })` or a computed `['role']` key
// are Property nodes. `<output>` carries an implicit status role no attribute shows; it is mostly a
// loading state, so it is deliberately not covered (docs/ANTI_PATTERNS.md).
const FEEDBACK_ROLE_VALUE = '/^(alert|status)$/';
const FEEDBACK_ROLE_VALUE_NODE = `:matches(Literal[value=${FEEDBACK_ROLE_VALUE}], TemplateElement[value.cooked=${FEEDBACK_ROLE_VALUE}])`;
const FEEDBACK_ROLE_SELECTOR = {
  selector: `:matches(JSXAttribute[name.name='role'], Property[key.name='role'][computed=false], Property[key.value='role']) ${FEEDBACK_ROLE_VALUE_NODE}`,
  message:
    'A hand-written role="alert"/role="status" message box bypasses the feedback pattern. Use FeedbackMessage (dashboard and account) or BrandedFeedbackMessage (public hotsite); a field message takes FieldFeedback / BrandedFieldFeedback with aria-describedby and no role (docs/ENGINEERING_RULES_FRONTEND.md § A form\'s error or success message lives in the action pane; TD57).',
};
// A hand-drawn red field message is the role-less half of the same defect (TD57-S17): a `<p>` with
// `text-red-*` that a manager reads as "this input is wrong" but that skips FieldFeedback (the id,
// the shared look) and so tends to skip the `aria-describedby` link too. A red class alone is far
// too broad (page banners, the required `*` marker, destructive links, status badges), so the rule
// keys on the pair every such message carried: a red class AND a `data-testid` naming an
// error/invalid state. That is a naming heuristic, not proof: a message with no test id, or one
// named otherwise, still needs the review-time check (docs/ANTI_PATTERNS.md). The field components
// themselves pass `data-testid={testId}` (an Identifier), so they need no exemption. The shapes
// mirror FEEDBACK_ROLE_SELECTOR for the same three bypass classes: a Literal nested in an
// expression container, call or conditional (descendant combinator), a TemplateElement, and an
// object (spread, createElement props) with both keys. The two markers must be sibling attributes
// (or sibling properties) of the same element or object (`~`, in both orders), so a red class on a
// nested element or object never pairs with a test id elsewhere.
const RED_CLASS_NODE =
  ':matches(Literal[value=/text-red-/], TemplateElement[value.cooked=/text-red-/])';
const ERROR_TESTID_NODE =
  ':matches(Literal[value=/(error|invalid)/], TemplateElement[value.cooked=/(error|invalid)/])';
const FEEDBACK_FIELD_MESSAGE_SELECTOR = {
  selector: `:matches(JSXAttribute[name.name='data-testid']:has(${ERROR_TESTID_NODE}) ~ JSXAttribute[name.name='className'] ${RED_CLASS_NODE}, JSXAttribute[name.name='className']:has(${RED_CLASS_NODE}) ~ JSXAttribute[name.name='data-testid'] ${ERROR_TESTID_NODE}, Property[key.value='data-testid']:has(${ERROR_TESTID_NODE}) ~ Property[key.name='className'] ${RED_CLASS_NODE}, Property[key.name='className']:has(${RED_CLASS_NODE}) ~ Property[key.value='data-testid'] ${ERROR_TESTID_NODE})`,
  message:
    "A hand-written red field message (a text-red-* class on an element whose data-testid names an error) bypasses FieldFeedback. Use FieldFeedback (dashboard and account) or BrandedFieldFeedback (public hotsite) with an id, and link the input to it with aria-invalid + aria-describedby (docs/ENGINEERING_RULES_FRONTEND.md § A form's error or success message lives in the action pane; TD57).",
};
// TD58-S10: a raw form control in dashboard or account code regrows the debt the shared
// primitives retired (focus ring, size, invalid state, the one label look). Five selectors, one
// per shape; each message names the primitive to use. A wrapping `<label>` with no `htmlFor`
// (`<label><Radio /> text</label>`) is deliberately allowed: no primitive replaces it, and
// jsx-a11y's label-has-associated-control already requires such a label to hold a control.
// `type="hidden"` is the only exempt input: ui/file-input and ui/file-dropzone cover files.
// The three bypass shapes (docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax` selectors):
// a computed member (`React['createElement']`), a bare destructured call (`createElement(...)`)
// and a literal nested in a conditional or logical expression. A tag name held in a variable
// (`const Tag = 'input'`) is the one shape a syntax selector cannot follow.
const RAW_CONTROL_TAG = '/^(input|textarea|select)$/';
const CREATE_ELEMENT_CALL =
  "CallExpression:matches([callee.name='createElement'], [callee.property.name='createElement'], [callee.property.value='createElement'])";
const HIDDEN_TYPE_VALUE =
  ":matches([value.value='hidden'], [value.expression.value='hidden'], [value.expression.quasis.0.value.cooked='hidden'])";
const RAW_INPUT_SELECTOR = {
  selector: `JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type']${HIDDEN_TYPE_VALUE}))`,
  message:
    'A raw <input> bypasses the shared form primitives. Use ui/input (text and number), ui/checkbox, ui/radio or ui/file-input / ui/file-dropzone; only type="hidden" is allowed (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo\'s UI primitives; TD58).',
};
const RAW_TEXTAREA_SELECTOR = {
  selector: "JSXOpeningElement[name.name='textarea']",
  message:
    "A raw <textarea> bypasses the shared form primitives. Use ui/textarea (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
const RAW_SELECT_SELECTOR = {
  selector: "JSXOpeningElement[name.name='select']",
  message:
    "A raw <select> bypasses the shared form primitives. Use ui/native-select, or ui/select for a styled list (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
const RAW_LABEL_FOR_SELECTOR = {
  selector: "JSXOpeningElement[name.name='label'] > JSXAttribute[name.name='htmlFor']",
  message:
    "A raw <label htmlFor> bypasses ui/label, the one caption look for a separate label. Use <Label htmlFor>; a label that wraps its control needs no htmlFor and stays allowed (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
const RAW_CREATE_ELEMENT_SELECTOR = {
  selector: `:matches(${CREATE_ELEMENT_CALL}[arguments.0.value=${RAW_CONTROL_TAG}], ${CREATE_ELEMENT_CALL}[arguments.0.type=/^(ConditionalExpression|LogicalExpression)$/]:has(:matches(ConditionalExpression, LogicalExpression) Literal[value=${RAW_CONTROL_TAG}]))`,
  message:
    "createElement('input' | 'textarea' | 'select') is the same raw control written without JSX. Use the shared form primitive instead (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
const RAW_FORM_CONTROL_SELECTORS = [
  RAW_INPUT_SELECTOR,
  RAW_TEXTAREA_SELECTOR,
  RAW_SELECT_SELECTOR,
  RAW_LABEL_FOR_SELECTOR,
  RAW_CREATE_ELEMENT_SELECTOR,
];
// Where raw controls are legitimate: the primitives themselves, and the branded trees that draw
// their own controls from the tenant's --ba-* tokens (docs/ENGINEERING_RULES_FRONTEND.md § The
// `--ba-*` exception). Anything else, including a folder added later, is covered by default.
const rawFormControlExemptPaths = [
  'shared/components/ui/**',
  'features/booking/components/public/**',
  'features/platform/components/public/**',
  'shared/components/hotsite/**',
  'shells/hotsite/**',
  'features/customer/components/InformationCompletionPhoneField.tsx',
];
// Whether a file path (relative to apps/web) falls under rawFormControlExemptPaths. The list holds
// `dir/**` prefixes and exact files; used to give a file that two tiers both name the right list.
const isRawFormControlExempt = (path) =>
  rawFormControlExemptPaths.some((entry) =>
    entry.endsWith('/**') ? path.startsWith(entry.slice(0, -2)) : path === entry,
  );
// The only files that may write the role: the two shared message components.
const feedbackRoleAllowedPaths = [
  'shared/components/ui/feedback-message.tsx',
  'shared/components/hotsite/branded-feedback-message.tsx',
];
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
// (docs/TESTING_STRATEGY.md § E2E Selector Strategy). Matches the dotted form
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
    'E2E-1 (TD37-S23): getByLabel()/getByText() break under i18n — use a data-testid selector instead (docs/TESTING_STRATEGY.md § E2E Selector Strategy).',
};
// E2E-2 bans an ISO date (YYYY-MM-DD) embedded directly in a data-testid string literal — a
// component change that shifts the rendered date silently breaks every e2e selector referencing
// it. Scoped to component definition sites (**/*.tsx below), not the e2e specs that consume the
// value. Matches both the plain string-literal JSX attribute form (data-testid="...") the
// pre-pr.sh grep matched, and a string literal wrapped in a JSXExpressionContainer
// (data-testid={'row-2026-08-31'}) — a different AST shape (value.type is JSXExpressionContainer,
// not Literal, so the plain form alone missed it) that the original grep also never caught, but
// is the same rule violation in substance (Codex review, PR #450, round 3).
const E2E2_SELECTOR = {
  selector:
    "JSXAttribute[name.name='data-testid']:matches([value.type='Literal'][value.value=/\\d{4}-\\d{2}-\\d{2}/], [value.type='JSXExpressionContainer'][value.expression.type='Literal'][value.expression.value=/\\d{4}-\\d{2}-\\d{2}/])",
  message:
    'E2E-2 (TD37-S23): no ISO date embedded in data-testid — encode it in a separate data-date attribute instead (docs/TESTING_STRATEGY.md).',
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
    'E2E-3 (TD37-S23): no template-literal data-testid — encode the dynamic part in a separate data-* attribute and keep data-testid static (docs/TESTING_STRATEGY.md).',
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
  IMAGE_BASE_URL_SELECTOR,
  LOCALE_LITERAL_SELECTOR,
  CSS_PROPERTIES_RETURN_SELECTOR,
  CSS_PROPERTIES_ARROW_SELECTOR,
  CSS_PROPERTIES_BARE_SELECTOR,
  ZOD_UUID_SELECTOR,
  ZOD_EMAIL_SELECTOR,
  E2E2_SELECTOR,
  E2E3_SELECTOR,
  FEEDBACK_ROLE_SELECTOR,
  FEEDBACK_FIELD_MESSAGE_SELECTOR,
  ...RAW_FORM_CONTROL_SELECTORS,
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
    files: reviewedRawFetchPaths.filter((path) => !isRawFormControlExempt(path)),
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...NON_FETCH_SELECTORS],
    },
  },
  // A reviewed raw-fetch file that is also a raw-control-exempt path (a branded hotsite file) needs
  // both tiers' omissions at once: the same list minus the raw-control selectors (TD58-S10).
  {
    files: reviewedRawFetchPaths.filter(isRawFormControlExempt),
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NON_FETCH_SELECTORS.filter((entry) => !RAW_FORM_CONTROL_SELECTORS.includes(entry)),
      ],
    },
  },
  // The files allowed to name the image-host variable keep every other ban: a later block REPLACES
  // the earlier one's selector list for the files it matches, so this one restates the list minus
  // IMAGE_BASE_URL_SELECTOR (and keeps the raw-fetch ban, which none of these files is reviewed to
  // skip).
  {
    files: imageBaseUrlAllowedPaths,
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        RAW_FETCH_SELECTOR,
        ...NON_FETCH_SELECTORS.filter((entry) => entry !== IMAGE_BASE_URL_SELECTOR),
      ],
    },
  },
  // The two shared message components write the role; every other ban still applies to them, so
  // this block restates the list minus FEEDBACK_ROLE_SELECTOR (a later block REPLACES the earlier
  // one's selector list for the files it matches).
  {
    files: feedbackRoleAllowedPaths,
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        RAW_FETCH_SELECTOR,
        ...NON_FETCH_SELECTORS.filter(
          (entry) =>
            entry !== FEEDBACK_ROLE_SELECTOR && !RAW_FORM_CONTROL_SELECTORS.includes(entry),
        ),
      ],
    },
  },
  // TD58-S10: the primitives and the branded trees draw raw controls by design. Same replace-not-
  // merge rule as the blocks above, so this one restates the list minus the raw-control selectors.
  // The two feedback components and the reviewed raw-fetch files keep their own blocks above, each
  // of which already omits the raw-control selectors where this block would.
  {
    files: rawFormControlExemptPaths,
    ignores: [
      '**/*.spec.ts',
      '**/*.spec.tsx',
      ...feedbackRoleAllowedPaths,
      ...reviewedRawFetchPaths,
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        RAW_FETCH_SELECTOR,
        ...NON_FETCH_SELECTORS.filter((entry) => !RAW_FORM_CONTROL_SELECTORS.includes(entry)),
      ],
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
  // shipped directly as `error` (docs/ANTI_PATTERNS.md, docs/TESTING_STRATEGY.md).
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
    },
  },
];
