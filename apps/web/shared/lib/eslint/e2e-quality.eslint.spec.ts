import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the actual CommonJS flat config rather than duplicating its rules in this spec — same
// approach as restricted-syntax.eslint.spec.ts (TD37-S04).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

describe('TD37-S23 E2E quality checks (web)', () => {
  const eslint = new Linter({ configType: 'flat' });

  function lint(source: string, filePath: string) {
    return eslint.verify(source, productionConfig, filePath);
  }

  function e2eMessages(messages: ReturnType<typeof lint>, prefix: string) {
    return messages.filter(
      (message) =>
        message.ruleId === 'no-restricted-syntax' &&
        typeof message.message === 'string' &&
        message.message.startsWith(prefix),
    );
  }

  describe('E2E-1: no getByLabel/getByText in e2e specs', () => {
    it('rejects page.getByLabel() in an e2e spec', () => {
      const messages = lint(
        "test('x', async ({ page }) => { await page.getByLabel('E-mail').fill('a@b.com'); });",
        'e2e/guest-booking.spec.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('break under i18n') }),
        ]),
      );
    });

    it('rejects page.getByText() in an e2e spec', () => {
      const messages = lint(
        "test('x', async ({ page }) => { await page.getByText('Salvar').click(); });",
        'e2e/guest-booking.spec.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toHaveLength(1);
    });

    it('permits page.getByRole() in an e2e spec', () => {
      const messages = lint(
        "test('x', async ({ page }) => { await page.getByRole('tab', { name: 'Branding' }).click(); });",
        'e2e/guest-booking.spec.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toHaveLength(0);
    });

    it('does not run E2E-1 outside apps/web/e2e/**/*.spec.ts', () => {
      const messages = lint(
        "test('x', async ({ page }) => { await page.getByLabel('E-mail').fill('a@b.com'); });",
        'e2e/helpers/booking.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toHaveLength(0);
    });

    it("rejects page['getByText'](...) computed-literal access (Codex review, PR #450 — same bypass class already fixed for RAW_FETCH_SELECTOR's window['fetch']())", () => {
      const messages = lint(
        "test('x', async ({ page }) => { await page['getByText']('Salvar').click(); });",
        'e2e/guest-booking.spec.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toHaveLength(1);
    });

    it('rejects a bare destructured getByText(...) call (Codex review, PR #450, round 2 — the retired pre-pr.sh grep still caught this via plain substring match; a member-only AST selector did not)', () => {
      const messages = lint(
        "test('x', async ({ page }) => { const { getByText } = page; await getByText('Salvar').click(); });",
        'e2e/guest-booking.spec.ts',
      );

      expect(e2eMessages(messages, 'E2E-1')).toHaveLength(1);
    });
  });

  describe('E2E-2: no ISO date embedded in data-testid', () => {
    it('rejects a data-testid string literal containing an ISO date', () => {
      const messages = lint(
        'export function Row() { return <div data-testid="row-2026-08-31" />; }',
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-2')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('ISO date') }),
        ]),
      );
    });

    it('permits a static data-testid alongside a separate data-date attribute', () => {
      const messages = lint(
        'export function Row() { return <div data-testid="row" data-date="2026-08-31" />; }',
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-2')).toHaveLength(0);
    });

    it('does not run E2E-2 inside a .spec.tsx file (Vitest-only mock, not a Playwright e2e concern)', () => {
      const messages = lint(
        'function Row() { return <div data-testid="row-2026-08-31" />; }',
        'shared/components/Row.spec.tsx',
      );

      expect(e2eMessages(messages, 'E2E-2')).toHaveLength(0);
    });
  });

  describe('E2E-3: no template-literal data-testid', () => {
    it('rejects a template-literal data-testid value', () => {
      const messages = lint(
        'export function Row({ i }: { i: number }) { return <div data-testid={`row-${i}`} />; }',
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-3')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('template-literal') }),
        ]),
      );
    });

    it('rejects a no-substitution template-literal data-testid value (same reach as the pre-pr.sh grep)', () => {
      const messages = lint(
        'export function Row() { return <div data-testid={`row`} />; }',
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-3')).toHaveLength(1);
    });

    it('permits a static string data-testid', () => {
      const messages = lint(
        'export function Row() { return <div data-testid="row" />; }',
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-3')).toHaveLength(0);
    });

    it('does not run E2E-3 inside a .spec.tsx file (Vitest-only mock, not a Playwright e2e concern — TD37-S23 discovery note: TestimonialsCarousel.spec.tsx)', () => {
      const messages = lint(
        'function items(count: number) { return Array.from({ length: count }, (_, i) => <div key={i} data-testid={`item-${i}`} />); }',
        'shared/components/TestimonialsCarousel.spec.tsx',
      );

      expect(e2eMessages(messages, 'E2E-3')).toHaveLength(0);
    });

    it('rejects a template literal nested inside a conditional expression (Codex review, PR #450 — a direct-child selector missed this; caught a real production instance in PillSelect)', () => {
      const messages = lint(
        "export function Row({ cond, i }: { cond: boolean; i: number }) { return <div data-testid={cond ? `row-${i}` : 'row'} />; }",
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-3')).toHaveLength(1);
    });
  });
});
