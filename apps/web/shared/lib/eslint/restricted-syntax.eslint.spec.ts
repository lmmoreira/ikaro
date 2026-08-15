import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec — mirrors
// apps/backend/src/eslint/persistence-boundary.eslint.spec.ts (Linter.verify() runs the same
// config array without Jest/Vitest's dynamic-import gap).
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
    it('rejects `as React.CSSProperties` in a return statement', () => {
      const messages = lint(
        'function style(): React.CSSProperties { return {} as React.CSSProperties; }',
        'features/platform/hotsite/utils/style.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining("Don't cast a function's return value"),
          }),
        ]),
      );
    });

    it('rejects `as React.CSSProperties` in an arrow function expression body', () => {
      const messages = lint(
        'const style = (): React.CSSProperties => ({} as React.CSSProperties);',
        'features/platform/hotsite/utils/style.ts',
      );

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

    it('rejects a bare `as CSSProperties` cast (import type { CSSProperties } from "react")', () => {
      const messages = lint(
        'function style(): CSSProperties { return {} as CSSProperties; }',
        'features/platform/hotsite/utils/style.ts',
      );

      expect(messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            ruleId: 'no-restricted-syntax',
            message: expect.stringContaining("Don't cast a function's return value"),
          }),
        ]),
      );
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
});
