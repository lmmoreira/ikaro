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
// TD51-S05: a surface painted with the tenant's secondary colour needs the text and accent colours
// `applyBranding()` derives to read over it. A hand-written `backgroundColor: 'var(--ba-secondary)'`
// leaves the text on whatever it inherits (`--ba-text`), which vanishes when the tenant's text colour
// is close to its secondary colour, so the colour is written in one place, BrandedPanel /
// brandedFieldStyle / brandedSurfaceStyle (shared/components/hotsite). The value test covers the
// three documented bypass classes (docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax`
// selectors): a Literal nested in a conditional or `??` expression is a descendant of the Property,
// a template literal is a TemplateElement, and a spread object, a computed `['backgroundColor']` key
// and the `background` shorthand are Property nodes. Known limits, not silently ignored: a Tailwind
// class (`bg-[var(--ba-secondary)]`), a colour held in a shared constant or returned by a function
// (module-styles.ts) and a `borderColor` are not seen. A border is decorative, so it stays.
const SECONDARY_SURFACE_VALUE = '/^var[(]--ba-secondary[)]$/';
const SECONDARY_SURFACE_SELECTOR = {
  selector: `:matches(Property[key.name=/^background(Color)?$/][computed=false], Property[key.value=/^background(Color)?$/]) :matches(Literal[value=${SECONDARY_SURFACE_VALUE}], TemplateElement[value.cooked=${SECONDARY_SURFACE_VALUE}])`,
  message:
    'A hand-written secondary-colour surface leaves its text on an inherited colour that can vanish on a branded tenant. Use BrandedPanel (a panel), brandedFieldStyle (an input) or brandedSurfaceStyle (shared/components/hotsite) so the text and accent take the derived --ba-secondary-text / --ba-secondary-accent (docs/ENGINEERING_RULES_FRONTEND.md § The `--ba-*` exception; TD51-S05).',
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
const RAW_CONTROL_TAG = '/^(input|textarea|select|button)$/';
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
    "createElement('input' | 'textarea' | 'select' | 'button') is the same raw control written without JSX. Use the shared primitive instead (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
// TD58-S13: a raw <button> in dashboard or account code regrows the debt ui/button, ui/choice-card,
// ui/drag-handle, ui/filter-chip and ui/tabs retired. The files whose buttons are genuinely
// bespoke (a full-width row, a nav item, a thumbnail) are listed by exact path in
// rawButtonExemptPaths below, so a new raw button anywhere else fails closed.
const RAW_BUTTON_SELECTOR = {
  selector: "JSXOpeningElement[name.name='button']",
  message:
    "A raw <button> bypasses the shared primitives. Use ui/button (variants link, link-destructive, link-muted, ghost-muted, outline; sizes inline, icon, icon-sm), ui/filter-chip, ui/choice-card, ui/drag-handle, ui/switch-field or ui/tabs; a genuinely bespoke control goes in rawButtonExemptPaths with a reason (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo's UI primitives; TD58).",
};
// A bare `<Input type="number">` shows no unit, so the user cannot tell minutes from hours. A numeric
// input goes through ui/number-input, whose `unit` prop is required. The literal is matched anywhere
// under the `type` attribute (a descendant, so `type="number"`, `type={'number'}`, a template literal,
// a conditional or logical expression at any depth are all followed: the three bypass shapes of
// docs/ENGINEERING_RULES_SHARED.md § `no-restricted-syntax` selectors), except where it sits in a
// conditional's `test` (`x === 'number' ? 'text' : 'tel'` renders no number input). A `type` held in a
// variable or a spread (`{...props}`) is the one shape a syntax selector cannot follow. The primitive
// itself is exempt by exact path in numberInputExemptPaths below.
const NUMBER_INPUT_SELECTOR = {
  // Descendant (the space) of the `type` attribute; the two `:not` clauses belong to the literal, so
  // they follow it without a space.
  selector:
    "JSXOpeningElement[name.name='Input'] > JSXAttribute[name.name='type'] " +
    ":matches(Literal[value='number'], TemplateElement[value.cooked='number'])" +
    ':not(.test):not(.test *)',
  message:
    'A bare <Input type="number"> shows no unit, so the user cannot tell minutes from hours. Use ui/number-input with a unit (docs/ENGINEERING_RULES_FRONTEND.md § Reuse the repo\'s UI primitives).',
};
const RAW_FORM_CONTROL_SELECTORS = [
  RAW_BUTTON_SELECTOR,
  RAW_INPUT_SELECTOR,
  RAW_TEXTAREA_SELECTOR,
  RAW_SELECT_SELECTOR,
  RAW_LABEL_FOR_SELECTOR,
  RAW_CREATE_ELEMENT_SELECTOR,
];
// Where a raw control is legitimate: the primitives (`shared/components/ui/**`), and by exact path
// (never a folder) the few branded files that must keep a native control no atom reproduces: the
// three atoms themselves, a visually hidden file input, a radio or checkbox group, a pill-shaped
// chat input, and the lead-form controls, which are deliberately left unbranded. A raw
// `<input>`, `<textarea>` or `<select>` anywhere else, including a folder added later, is covered by
// default and points to BrandedInput / BrandedTextarea / BrandedSelect (or the ui/ primitive).
const rawFormControlExemptPaths = [
  'shared/components/ui/**',
  'shared/components/hotsite/branded-input.tsx',
  'shared/components/hotsite/branded-textarea.tsx',
  'shared/components/hotsite/branded-select.tsx',
  'features/booking/components/public/AvailabilityAlertFields.tsx',
  'features/booking/components/public/PhotoUpload.tsx',
  'features/booking/components/public/ResourcePicker.tsx',
  'features/booking/components/public/ServiceCard.tsx',
  'features/platform/components/public/ContactField.tsx',
  'features/platform/components/public/LeadFormPhoneField.tsx',
  'features/platform/components/public/LeadFormQuestionField.tsx',
  'shells/hotsite/components/ChatbotPanel.tsx',
];
// The tenant-branded trees draw their own buttons (--ba-btn-* tokens, no ui/button) and their own
// `<label htmlFor>`, so only those two bans are lifted across them (docs/ENGINEERING_RULES_FRONTEND.md
// § The `--ba-*` exception). The text-control bans are not: they apply here as everywhere.
const brandedTreePaths = [
  'features/booking/components/public/**',
  'features/platform/components/public/**',
  'shared/components/hotsite/**',
  'shells/hotsite/**',
  'features/customer/components/InformationCompletionPhoneField.tsx',
];
// Inside the branded trees a raw text control is flagged with a message that names the branded
// atom, not the dashboard primitive: the same selectors as the generic bans, a different pointer.
const brandedTreeMessage = (tag, atom) =>
  `A raw <${tag}> in a tenant-branded file bypasses ${atom}. Use ${atom} (the field edge, text and placeholder colours are derived from the tenant palette); docs/ENGINEERING_RULES_FRONTEND.md § The \`--ba-*\` exception; TD51-S06.`;
const BRANDED_RAW_INPUT_SELECTOR = {
  selector: RAW_INPUT_SELECTOR.selector,
  message: brandedTreeMessage('input', 'BrandedInput'),
};
const BRANDED_RAW_TEXTAREA_SELECTOR = {
  selector: RAW_TEXTAREA_SELECTOR.selector,
  message: brandedTreeMessage('textarea', 'BrandedTextarea'),
};
const BRANDED_RAW_SELECT_SELECTOR = {
  selector: RAW_SELECT_SELECTOR.selector,
  message: brandedTreeMessage('select', 'BrandedSelect'),
};
// A file that mixes native choice controls with branded text controls: the checkbox, radio and file
// inputs may stay raw (the browser draws them), while a raw text `<input>`, `<textarea>` and
// `<select>` still fail. The static `type` must be a literal: a conditional or a variable is flagged.
const BRANDED_CHOICE_TYPE = '/^(checkbox|radio|file|hidden)$/';
const BRANDED_TEXT_INPUT_SELECTOR = {
  selector: `JSXOpeningElement[name.name='input']:not(:has(JSXAttribute[name.name='type']:matches([value.value=${BRANDED_CHOICE_TYPE}], [value.expression.value=${BRANDED_CHOICE_TYPE}], [value.expression.quasis.0.value.cooked=${BRANDED_CHOICE_TYPE}])))`,
  message: brandedTreeMessage('text <input>', 'BrandedInput'),
};
const brandedChoiceControlPaths = [
  'features/booking/components/public/IntakeAnswersStep.tsx',
  'features/booking/components/public/IntakeAttendeesList.tsx',
  'features/booking/components/public/IntakeQuestionField.tsx',
];
// The files that may draw a numeric `<Input>` without a unit, by exact path (never a
// folder). Only ui/number-input.tsx: it is the primitive that adds the unit.
const numberInputExemptPaths = ['shared/components/ui/number-input.tsx'];
// TD51-S05: the files that may write a secondary-colour surface, by exact path (never a folder).
// branded-surface-style.ts is the one place the colour is written for everyone else; module-styles.ts
// returns it as a bare string the sections pair with --ba-section-text; the shell files below were
// checked one by one to pair it with --ba-secondary-text / --ba-secondary-accent (the bar, the
// navigation, the footer, the service detail card), or to hold only bubbles that paint their own
// surface (ChatbotPanel). BrandCard and TestimonialCard are not listed: they use the helper.
const secondarySurfaceExemptPaths = [
  'shared/components/hotsite/branded-surface-style.ts',
  'features/platform/hotsite/module-styles.ts',
  'shells/hotsite/components/ChatbotPanel.tsx',
  'shells/hotsite/components/Footer.tsx',
  'shells/hotsite/components/HotsiteAuthBar.tsx',
  'shells/hotsite/components/HotsiteAuthBarDropdown.tsx',
  'shells/hotsite/components/HotsiteAuthBarSignedOut.tsx',
  'shells/hotsite/components/HotsiteNavigation.tsx',
  'shells/hotsite/components/ServiceDetailPage.tsx',
];
// TD58-S13: the files whose raw <button>s are bespoke, listed by exact path (never a folder) so a
// new raw button elsewhere still fails. Each holds a control no primitive reproduces: a full-width
// option row, a week or timeline cell, a nav item or back link, a thumbnail, a hotsite preview
// wrapper, or a tenant-branded customer control (docs/ENGINEERING_RULES_FRONTEND.md § The
// `--ba-*` exception). Only the button ban is lifted for these; every other ban still applies.
const rawButtonExemptPaths = [
  'features/booking/components/dashboard/bookings/reschedule/SlotConflictAlert.tsx',
  'features/booking/components/dashboard/schedule/ScheduleWeekView.tsx',
  'features/booking/components/dashboard/schedule/TimelineBlockShell.tsx',
  'features/booking/components/dashboard/services/IntakeVersionHistoryCard.tsx',
  'features/customer/components/InformationCompletionPrompt.tsx',
  'features/customer/components/SwitchTenantClient.tsx',
  'features/customer/components/TenantOptionRow.tsx',
  'features/platform/components/hotsite/PreviewSelectionWrapper.tsx',
  'features/platform/components/hotsite/modules/BookingPhotoThumbnailGroup.tsx',
  'features/staff/components/SelectStaffTenantClient.tsx',
  'shells/dashboard/components/BottomNav.tsx',
  'shells/dashboard/components/Topbar.tsx',
  'shells/dashboard/components/WeekNav.tsx',
];
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
  NUMBER_INPUT_SELECTOR,
  SECONDARY_SURFACE_SELECTOR,
];

// The reviewed exceptions, by list. Each lifts exactly the bans named here and nothing else.
const EXCEPTION_LISTS = [
  {
    paths: [...reviewedRawFetchPaths, 'shared/lib/api/bff-server.ts'],
    lifts: [RAW_FETCH_SELECTOR],
  },
  { paths: imageBaseUrlAllowedPaths, lifts: [IMAGE_BASE_URL_SELECTOR] },
  { paths: feedbackRoleAllowedPaths, lifts: [FEEDBACK_ROLE_SELECTOR] },
  { paths: rawFormControlExemptPaths, lifts: RAW_FORM_CONTROL_SELECTORS },
  {
    paths: brandedTreePaths,
    lifts: [RAW_BUTTON_SELECTOR, RAW_LABEL_FOR_SELECTOR],
    swaps: [
      [RAW_INPUT_SELECTOR, BRANDED_RAW_INPUT_SELECTOR],
      [RAW_TEXTAREA_SELECTOR, BRANDED_RAW_TEXTAREA_SELECTOR],
      [RAW_SELECT_SELECTOR, BRANDED_RAW_SELECT_SELECTOR],
    ],
  },
  { paths: rawButtonExemptPaths, lifts: [RAW_BUTTON_SELECTOR] },
  { paths: numberInputExemptPaths, lifts: [NUMBER_INPUT_SELECTOR] },
  { paths: secondarySurfaceExemptPaths, lifts: [SECONDARY_SURFACE_SELECTOR] },
  {
    paths: brandedChoiceControlPaths,
    lifts: [],
    swaps: [[BRANDED_RAW_INPUT_SELECTOR, BRANDED_TEXT_INPUT_SELECTOR]],
  },
];
const isGlobEntry = (entry) => entry.endsWith('/**');
// Whether `entry` (an exact path or a `dir/**` glob) is named by a list, directly or under one of
// its `dir/**` globs.
const listCovers = (list, entry) =>
  list.some((item) => item === entry || (isGlobEntry(item) && entry.startsWith(item.slice(0, -2))));
// The complete selector list of one path: every ban, minus what each list covering the path lifts,
// with what a list swaps (same selector, a message that names the atom).
function selectorsFor(entry) {
  const covering = EXCEPTION_LISTS.filter((list) => listCovers(list.paths, entry));
  const lifted = new Set(covering.flatMap((list) => list.lifts));
  const kept = [RAW_FETCH_SELECTOR, ...NON_FETCH_SELECTORS].filter((entry) => !lifted.has(entry));
  // Applied in list order, so a later list may swap what an earlier one already swapped in.
  return covering
    .flatMap((list) => list.swaps ?? [])
    .reduce((acc, [from, to]) => acc.map((sel) => (sel === from ? to : sel)), kept);
}
// One block per distinct selector list. Blocks for `dir/**` globs come first, so an exact file
// inside such a folder (which gets its own, narrower list) is matched by a later block and wins.
function exceptionBlocks() {
  const entries = [...new Set(EXCEPTION_LISTS.flatMap((list) => list.paths))];
  const groups = new Map();
  for (const entry of entries) {
    const selectors = selectorsFor(entry);
    const key = `${isGlobEntry(entry) ? 'a' : 'b'}:${selectors.map((s) => s.message).join('|')}`;
    const group = groups.get(key) ?? { selectors, files: [] };
    group.files.push(entry);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { selectors, files }]) => ({
      files,
      ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
      rules: { 'no-restricted-syntax': ['error', ...selectors] },
    }));
}

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
  // One `no-restricted-syntax` block for every file, then one generated block per distinct set of
  // reviewed exceptions (`exceptionBlocks()` below). ESLint flat config REPLACES (not merges) a rule's
  // options when two config objects both set it for the same file, so an exempt file needs its own
  // complete selector list; the helper computes that list from the file's flags instead of one
  // hand-written block per combination (see apps/backend/eslint.config.js's TD24-S03 comment for
  // the same trap).
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': ['error', RAW_FETCH_SELECTOR, ...NON_FETCH_SELECTORS],
    },
  },
  ...exceptionBlocks(),
  // TD58-S14: a hooks/ or model/ file is a logic layer and does not import from any components/
  // directory (a type or helper both sides need lives in model/; a provider value is passed in by
  // the component). `no-restricted-imports` is its own rule key, so unlike the no-restricted-syntax
  // blocks above it restates nothing. The regex flags a path that has a `components` segment and
  // does not run through shared/components/ui/ (the primitives are the lowest layer). It sees
  // static imports, `import type` and `export ... from`; `require()` is already an error through
  // @typescript-eslint/no-require-imports, and a dynamic `import()` is not covered (none exists in
  // these folders).
  {
    files: [
      'features/*/hooks/**/*.{ts,tsx}',
      'features/*/model/**/*.{ts,tsx}',
      'shells/*/model/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^(?!.*(^|/)shared/components/ui/).*(^|/)components(/|$)`,
              message:
                'A hooks/ or model/ file does not import from a components/ directory: move the shared type or helper to model/, or pass the value in from the component (docs/REPOSITORY_STRUCTURE.md § Web placement rules). shared/components/ui/** is allowed.',
            },
          ],
        },
      ],
    },
  },
  // TD58-S15: shared/components/ui/** is the bottom UI layer (primitives and composed patterns with
  // no domain word in them), so it imports nothing app-local above shared/lib: no feature, shell,
  // provider, route or app-local i18n helper. Own rule key and own `files` glob, so it neither
  // restates nor replaces the S14 block above. The regex catches the `@/` alias and a relative
  // path that climbs out (`../`), for static imports, `import type` and `export ... from`; a
  // dynamic `import()` is not covered (none exists in ui/). Specs are skipped, like S14.
  {
    files: ['shared/components/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: String.raw`^(@/|(\.\./)+)(features|shells|providers|app|i18n)(/|$)`,
              message:
                'A shared/components/ui/** primitive does not import from features, shells, providers, app or i18n: it is the bottom UI layer, so pass what it needs in as props (docs/ENGINEERING_RULES_FRONTEND.md § UI layer model).',
            },
            // A specifier with a `segment/..` step (`@/shared/../features/x`) resolves into another
            // layer without matching the pattern above, and a regex cannot resolve a path, so such a
            // non-normalised specifier is rejected outright. Leading `../` chains stay allowed.
            {
              regex: String.raw`(^|/)(?!\.\.(/|$))[^/]+/\.\.(/|$)`,
              message:
                'A shared/components/ui/** primitive does not use a non-normalised import path (a `segment/..` step): write the direct path, so the layer check can see where it points.',
            },
          ],
        },
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
