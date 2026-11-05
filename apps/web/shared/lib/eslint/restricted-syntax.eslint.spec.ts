import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec — mirrors
// apps/backend/src/eslint/persistence-boundary.eslint.spec.ts (Linter.verify() runs the same
// config array without Jest/Vitest's dynamic-import gap).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

describe('TD37-S04 restricted syntax (web)', () => {
  const eslint = new Linter({ configType: 'flat' });

  function lint(source: string, filePath: string) {
    return eslint.verify(source, productionConfig, filePath);
  }

  describe('raw fetch() ban', () => {
    it('rejects a raw fetch() call in feature code', () => {
      const messages = lint(
        "export async function loadThing() { return fetch('https://example.com'); }",
        'features/booking/api/example.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('sanctioned BFF transport helpers'),
          }),
        ]),
      );
    });

    it('rejects globalThis.fetch() and window.fetch() (Codex review, PR #375)', () => {
      const globalThisMessages = lint(
        "export async function a() { return globalThis.fetch('https://example.com'); }",
        'features/booking/api/example.ts',
      );
      const windowMessages = lint(
        "export async function b() { return window.fetch('https://example.com'); }",
        'features/booking/api/example.ts',
      );

      for (const messages of [globalThisMessages, windowMessages]) {
        expect(messages).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              ruleId: 'no-restricted-syntax',
              message: expect.stringContaining('sanctioned BFF transport helpers'),
            }),
          ]),
        );
      }
    });

    it("rejects window['fetch']() (computed member access — Codex review, PR #375, round 2)", () => {
      const messages = lint(
        "export async function a() { return window['fetch']('https://example.com'); }",
        'features/booking/api/example.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('sanctioned BFF transport helpers'),
          }),
        ]),
      );
    });

    it('permits a reviewed raw-fetch-web exception (architecture-policy.json)', () => {
      const messages = lint(
        "export async function proxy() { return fetch('https://example.com'); }",
        'features/auth/api.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('sanctioned BFF transport helpers'),
        ),
      ).toHaveLength(0);
    });

    it('permits the same-origin gateway Route Handler despite its literal square-bracket path', () => {
      const messages = lint(
        "export async function proxy() { return fetch('https://example.com'); }",
        'app/v1/[...path]/route.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('sanctioned BFF transport helpers'),
        ),
      ).toHaveLength(0);
    });

    it('permits the bffServerFetch/bffPublicFetch definition site itself', () => {
      const messages = lint(
        'export async function bffPublicFetch(path: string) { return fetch(path); }',
        'shared/lib/api/bff-server.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('sanctioned BFF transport helpers'),
        ),
      ).toHaveLength(0);
    });

    it('a reviewed raw-fetch-web exception still enforces the other five rules (CodeRabbit review, PR #375)', () => {
      // ESLint flat config's `ignores` applies to the whole block, not to a single selector — an
      // earlier version of this config exempted a reviewed file from the fetch ban by excluding
      // it from the block that ALSO carried the locale/CSSProperties/Zod bans, silently losing
      // those too for every reviewed file. This proves the fix: the file is still linted for a
      // real, unrelated violation.
      const messages = lint(
        "const locale = resolveSupportedLocale('pt-BR'); export async function proxy() { return fetch('https://example.com'); }",
        'features/auth/api.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('Do not hardcode a locale string'),
          }),
        ]),
      );
      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('sanctioned BFF transport helpers'),
        ),
      ).toHaveLength(0);
    });
  });

  describe('hardcoded protected-area locale ban', () => {
    it('rejects a bare literal passed to resolveSupportedLocale()', () => {
      const messages = lint(
        "const locale = resolveSupportedLocale('pt-BR');",
        'shells/dashboard/model/dashboard-shell-context.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('Do not hardcode a locale string'),
          }),
        ]),
      );
    });

    it('rejects a no-substitution template literal (Codex review, PR #375)', () => {
      const messages = lint(
        'const locale = resolveSupportedLocale(`pt-BR`);',
        'shells/dashboard/model/dashboard-shell-context.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('Do not hardcode a locale string'),
          }),
        ]),
      );
    });

    it('permits a literal used only as the ?? fallback', () => {
      const messages = lint(
        "const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');",
        'shells/dashboard/model/dashboard-shell-context.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('Do not hardcode a locale string'),
        ),
      ).toHaveLength(0);
    });
  });

  describe('React.CSSProperties return-position cast ban', () => {
    it.each([
      [
        'a return statement, namespaced `as React.CSSProperties`',
        'function style(): React.CSSProperties { return {} as React.CSSProperties; }',
      ],
      [
        'an arrow function expression body, namespaced `as React.CSSProperties`',
        'const style = (): React.CSSProperties => ({} as React.CSSProperties);',
      ],
      [
        'a bare (non-namespaced) `as CSSProperties` cast (import type { CSSProperties } from "react")',
        'function style(): CSSProperties { return {} as CSSProperties; }',
      ],
    ])('rejects a return-position CSS cast — %s', (_label, source) => {
      const messages = lint(source, 'features/platform/hotsite/utils/style.ts');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining("Don't cast a function's return value"),
          }),
        ]),
      );
    });

    it('permits `as React.CSSProperties` used inline in a JSX prop (not a function return)', () => {
      const messages = lint(
        'const props = { style: {} as React.CSSProperties };',
        'features/platform/hotsite/utils/style.ts',
      );

      expect(
        messages.filter(
          (message) =>
            message.ruleId === 'no-restricted-syntax' &&
            typeof message.message === 'string' &&
            message.message.includes('CSSProperties'),
        ),
      ).toHaveLength(0);
    });
  });

  describe('repo-wide Zod uuid()/email() ban (shared via @ikaro/config/eslint-base.js)', () => {
    it('rejects z.string().uuid()', () => {
      const messages = lint('const schema = z.string().uuid();', 'features/booking/schema.ts');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('z.uuid()'),
          }),
        ]),
      );
    });

    it('rejects z.string().email()', () => {
      const messages = lint('const schema = z.string().email();', 'features/booking/schema.ts');

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('z.email()'),
          }),
        ]),
      );
    });

    it('rejects a refined chain: z.string().min(1).uuid()', () => {
      const messages = lint(
        'const schema = z.string().min(1).uuid();',
        'features/booking/schema.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('z.uuid()'),
          }),
        ]),
      );
    });
  });

  describe('image-host variable ban (TD56-S07)', () => {
    const NAME = 'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL';
    const isImageHostMessage = (message: { message: string }): boolean =>
      message.message.includes('origin for the CSP and next/image only');

    it.each([
      ['getPublicEnv() with a string literal', `const base = getPublicEnv('${NAME}');`],
      ['a dotted process.env member', `const base = process.env.${NAME};`],
      ['a computed process.env literal', `const base = process.env['${NAME}'];`],
      ['a no-substitution template literal', `const base = getPublicEnv(\`${NAME}\`);`],
      ['a destructured key', `const { ${NAME}: base } = process.env;`],
      ['a shorthand destructured binding', `const { ${NAME} } = process.env;`],
      ['a nested conditional', `const base = ok ? getPublicEnv('${NAME}') : '';`],
    ])('rejects reading the variable through %s', (_label, source) => {
      expect(
        lint(source, 'features/platform/hotsite/compose.ts').filter(isImageHostMessage),
      ).not.toHaveLength(0);
    });

    it('rejects it in a component file too', () => {
      expect(
        lint(
          `export function A() { return <img src={getPublicEnv('${NAME}')} alt="" />; }`,
          'features/platform/components/hotsite/A.tsx',
        ).filter(isImageHostMessage),
      ).not.toHaveLength(0);
    });

    it.each([
      'proxy.ts',
      'next.config.ts',
      'shared/lib/runtime-env/public-env.ts',
      'test-utils.tsx',
    ])('permits %s, the origin-only consumers', (filePath) => {
      expect(
        lint(`const base = getPublicEnv('${NAME}');`, filePath).filter(isImageHostMessage),
      ).toHaveLength(0);
    });

    it('an allowed file still enforces the other bans', () => {
      const messages = lint(
        `const base = getPublicEnv('${NAME}'); export async function a() { return fetch('https://example.com'); }`,
        'proxy.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('sanctioned BFF transport helpers'),
          }),
        ]),
      );
    });

    it('does not flag an unrelated variable', () => {
      expect(
        lint(`const base = getPublicEnv('NEXT_PUBLIC_SITE_URL');`, 'features/a/b.ts').filter(
          isImageHostMessage,
        ),
      ).toHaveLength(0);
    });
  });

  describe('hand-written feedback role ban (TD57-S05)', () => {
    const isFeedbackRoleMessage = (message: { message: string }): boolean =>
      message.message.includes('bypasses the feedback pattern');
    const COMPONENT = 'features/booking/components/public/Example.tsx';
    const SHARED_UI = 'shared/components/ui/feedback-message.tsx';
    const SHARED_BRANDED = 'shared/components/hotsite/branded-feedback-message.tsx';

    it.each([
      ['a literal role="alert"', 'export const A = () => <div role="alert">x</div>;'],
      ['a literal role="status"', 'export const A = () => <div role="status">x</div>;'],
      [
        "an expression container role={'alert'}",
        "export const A = () => <div role={'alert'}>x</div>;",
      ],
      ['a template literal role={`alert`}', 'export const A = () => <div role={`alert`}>x</div>;'],
      [
        'a conditional value',
        "export const A = ({ on }: { on: boolean }) => <div role={on ? 'alert' : undefined}>x</div>;",
      ],
      ['a spread object', "export const A = () => <div {...{ role: 'alert' }}>x</div>;"],
      [
        'a spread object with a string key',
        "export const A = () => <div {...{ 'role': 'status' }}>x</div>;",
      ],
      ['a computed role key', "export const A = () => <div {...{ ['role']: 'alert' }}>x</div>;"],
      [
        'createElement with a props object',
        "export const a = () => createElement('div', { role: 'alert' });",
      ],
      [
        'a props object built apart',
        "const props = { role: 'status', className: 'x' }; export const a = () => createElement('div', props);",
      ],
    ])('rejects %s', (_label, source) => {
      const messages = lint(source, COMPONENT).filter(isFeedbackRoleMessage);

      expect(messages).not.toHaveLength(0);
      expect(messages[0].message).toContain('FeedbackMessage');
      expect(messages[0].message).toContain('BrandedFeedbackMessage');
    });

    it('rejects it in a plain .ts file too', () => {
      expect(
        lint("export const a = { role: 'alert' };", 'features/booking/model/example.ts').filter(
          isFeedbackRoleMessage,
        ),
      ).not.toHaveLength(0);
    });

    it.each([
      ['role="dialog"', 'export const A = () => <div role="dialog">x</div>;'],
      ['role="navigation"', 'export const A = () => <nav role="navigation">x</nav>;'],
      ['role="group"', 'export const A = () => <div role="group">x</div>;'],
      [
        'a role held in a variable',
        'export const A = ({ r }: { r: string }) => <div role={r}>x</div>;',
      ],
      [
        'a loading <output> (implicit status role)',
        'export const A = () => <output aria-busy="true">x</output>;',
      ],
      ["a value 'alert' that is not a role", "export const a = { kind: 'alert' };"],
      ['a staff role value', "export const a = { role: 'MANAGER' };"],
    ])('does not flag %s', (_label, source) => {
      expect(lint(source, COMPONENT).filter(isFeedbackRoleMessage)).toHaveLength(0);
    });

    it.each([SHARED_UI, SHARED_BRANDED])('permits the shared message component %s', (filePath) => {
      expect(
        lint('export const A = () => <div role="alert">x</div>;', filePath).filter(
          isFeedbackRoleMessage,
        ),
      ).toHaveLength(0);
    });

    it('an allowed file still enforces the other bans', () => {
      const messages = lint(
        'const locale = resolveSupportedLocale(\'pt-BR\'); export const A = () => <div role="alert">x</div>;',
        SHARED_UI,
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining('Do not hardcode a locale string'),
          }),
        ]),
      );
      expect(messages.filter(isFeedbackRoleMessage)).toHaveLength(0);
    });

    it('a field-message component is not an allowed file', () => {
      expect(
        lint(
          'export const A = () => <div role="alert">x</div>;',
          'shared/components/ui/field-feedback.tsx',
        ).filter(isFeedbackRoleMessage),
      ).not.toHaveLength(0);
    });

    it('does not lint a spec file', () => {
      expect(
        lint(
          'it("x", () => { render(<div role="alert">x</div>); });',
          'features/booking/components/public/Example.spec.tsx',
        ).filter(isFeedbackRoleMessage),
      ).toHaveLength(0);
    });
  });

  describe('hand-written red field message ban (TD57-S17)', () => {
    const isRedFieldMessage = (message: { message: string }): boolean =>
      message.message.includes('hand-written red field message');
    const COMPONENT = 'features/booking/components/dashboard/services/Example.tsx';

    it.each([
      [
        'a literal className and data-testid',
        'export const A = () => <p data-testid="x-error" className="text-sm text-red-600">x</p>;',
      ],
      [
        'an invalid-named test id',
        'export const A = () => <p className="mt-1 text-xs text-red-600" data-testid="buffer-invalid">x</p>;',
      ],
      [
        'expression-container values',
        "export const A = () => <p className={'text-red-600'} data-testid={'x-error'}>x</p>;",
      ],
      [
        'template literal values',
        'export const A = () => <p className={`text-red-600`} data-testid={`x-error`}>x</p>;',
      ],
      [
        'a class nested in a cn() call',
        "export const A = () => <p className={cn('mt-1', 'text-red-600')} data-testid=\"x-error\">x</p>;",
      ],
      [
        'a class and test id nested in conditionals',
        "export const A = ({ on }: { on: boolean }) => <p className={on ? 'text-red-600' : 'text-gray-500'} data-testid={on ? 'x-error' : 'x-hint'}>x</p>;",
      ],
      [
        'a spread object',
        "export const A = () => <p {...{ className: 'text-red-600', 'data-testid': 'x-error' }}>x</p>;",
      ],
      [
        'a test id declared before the class in createElement props',
        "export const a = () => createElement('p', { 'data-testid': 'x-error', className: 'text-red-600' });",
      ],
      [
        'createElement props',
        "export const a = () => createElement('p', { className: 'text-red-600', 'data-testid': 'x-error' });",
      ],
      [
        'a props object built apart',
        "const props = { className: 'text-red-600', 'data-testid': 'x-error' }; export const a = () => createElement('p', props);",
      ],
    ])('rejects %s', (_label, source) => {
      const messages = lint(source, COMPONENT).filter(isRedFieldMessage);

      expect(messages).not.toHaveLength(0);
      expect(messages[0].message).toContain('FieldFeedback');
      expect(messages[0].message).toContain('BrandedFieldFeedback');
    });

    it.each([
      ['a red required marker', 'export const A = () => <span className="text-red-600">*</span>;'],
      [
        'a red element whose test id does not name an error',
        'export const A = () => <p data-testid="outcome-banner-title" className="text-red-700">x</p>;',
      ],
      [
        'an error-named element with no red class',
        'export const A = () => <p data-testid="x-error" className="text-sm text-gray-600">x</p>;',
      ],
      [
        'an error test id and a red class on different elements',
        'export const A = () => <div data-testid="x-error"><span className="text-red-600">x</span></div>;',
      ],
      [
        'a red class on a nested object and an error test id on the outer one',
        "export const a = { inner: { className: 'text-red-600' }, 'data-testid': 'x-error' };",
      ],
      [
        'a red class on an element nested in a prop and an error test id on the outer element',
        'export const A = () => <Foo render={<span className="text-red-600" />} data-testid="x-error" />;',
      ],
      [
        'a test id passed through a variable (the field components themselves)',
        'export const A = ({ testId }: { testId: string }) => <p data-testid={testId} className="text-red-600">x</p>;',
      ],
    ])('does not flag %s', (_label, source) => {
      expect(lint(source, COMPONENT).filter(isRedFieldMessage)).toHaveLength(0);
    });

    it.each([
      'shared/components/ui/field-feedback.tsx',
      'shared/components/hotsite/branded-field-feedback.tsx',
    ])('does not flag the shared field component %s (its test id is a prop)', (filePath) => {
      expect(
        lint(
          'export const A = ({ testId }: { testId?: string }) => <p data-testid={testId} className="text-red-600">x</p>;',
          filePath,
        ).filter(isRedFieldMessage),
      ).toHaveLength(0);
    });

    it('does not lint a spec file', () => {
      expect(
        lint(
          'it("x", () => { render(<p data-testid="x-error" className="text-red-600">x</p>); });',
          'features/booking/components/dashboard/services/Example.spec.tsx',
        ).filter(isRedFieldMessage),
      ).toHaveLength(0);
    });
  });
});
