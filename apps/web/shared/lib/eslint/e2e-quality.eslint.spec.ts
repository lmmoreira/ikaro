import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

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

    // SonarCloud S5976: 3 near-identical "rejects getByText() via <form>" tests, differing only
    // in the source string linted — parameterized into one.
    it.each([
      ['dotted member access', "await page.getByText('Salvar').click();"],
      [
        "computed-literal member access (Codex review, PR #450 — same bypass class already fixed for RAW_FETCH_SELECTOR's window['fetch']())",
        "await page['getByText']('Salvar').click();",
      ],
      [
        'a bare destructured call (Codex review, PR #450, round 2 — the retired pre-pr.sh grep still caught this via plain substring match; a member-only AST selector did not)',
        "const { getByText } = page; await getByText('Salvar').click();",
      ],
    ])('rejects page.getByText() via %s', (_label, statement) => {
      const messages = lint(
        `test('x', async ({ page }) => { ${statement} });`,
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

    it("rejects a JSXExpressionContainer-wrapped string literal containing an ISO date (data-testid={'row-2026-08-31'}) — a different AST shape than the plain string form; the retired pre-pr.sh grep didn't catch this either, but it's the same rule violation (Codex review, PR #450, round 3)", () => {
      const messages = lint(
        "export function Row() { return <div data-testid={'row-2026-08-31'} />; }",
        'shared/components/Row.tsx',
      );

      expect(e2eMessages(messages, 'E2E-2')).toHaveLength(1);
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

  // AC3 (TD37-S23): "A fixture PR introducing each of the 3 violations fails at ci:fast/push
  // time, not just at a later, separate pre-pr.sh invocation." Linter.verify() above proves the
  // selectors are correct, but only by calling ESLint's JS API in-process — it doesn't prove the
  // real `pnpm lint` command (what ci:fast and the pre-push hook actually run) rejects a
  // violation. Spawns the real CLI as a subprocess against on-disk fixture files, same approach
  // as TD37-S18's eslint-next-plugin.eslint.spec.ts (Codex review, PR #450, round 4 — a manual
  // git-push demonstration in the PR thread proved the mechanism once but left no permanent,
  // CI-re-verified artifact).
  describe('AC3: a real fixture violation fails the actual pnpm lint command', () => {
    function runLint(): { status: number; output: string } {
      try {
        execFileSync('pnpm', ['lint'], { cwd: webRoot, stdio: 'pipe' });
        return { status: 0, output: '' };
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'status' in error) {
          return {
            status: typeof error.status === 'number' ? error.status : 1,
            output: [
              'stdout' in error && Buffer.isBuffer(error.stdout) ? error.stdout.toString() : '',
              'stderr' in error && Buffer.isBuffer(error.stderr) ? error.stderr.toString() : '',
            ].join('\n'),
          };
        }
        return { status: 1, output: '' };
      }
    }

    it('blocks a real E2E-1/E2E-2/E2E-3 violation via the actual pnpm lint command, then accepts the corrected fixtures', () => {
      // E2E-1 needs apps/web/e2e/**/*.spec.ts; E2E-2/E2E-3 need apps/web/**/*.tsx (not
      // *.spec.tsx) — two separate fixture locations, matching each rule's real scope.
      const e2eDir = mkdtempSync(join(webRoot, 'e2e', 'e2e-quality-fixture-'));
      const e2eFixture = join(e2eDir, 'fixture.spec.ts');
      const tsxDir = mkdtempSync(join(webRoot, 'e2e-quality-fixture-'));
      const tsxFixture = join(tsxDir, 'fixture.tsx');

      try {
        writeFileSync(
          e2eFixture,
          [
            "import { test } from '@playwright/test';",
            '',
            "test('x', async ({ page }) => {",
            "  await page.getByText('Salvar').click();",
            '});',
            '',
          ].join('\n'),
        );
        writeFileSync(
          tsxFixture,
          'export function Row({ i }: { i: number }): React.JSX.Element {\n  return (\n    <>\n      <div data-testid="row-2026-08-31" />\n      <div data-testid={`row-${i}`} />\n    </>\n  );\n}\n',
        );
        const violating = runLint();
        expect(violating.status).not.toBe(0);
        expect(violating.output).toContain('E2E-1');
        expect(violating.output).toContain('E2E-2');
        expect(violating.output).toContain('E2E-3');

        writeFileSync(
          e2eFixture,
          [
            "import { test } from '@playwright/test';",
            '',
            "test('x', async ({ page }) => {",
            "  await page.getByTestId('save-button').click();",
            '});',
            '',
          ].join('\n'),
        );
        writeFileSync(
          tsxFixture,
          'export function Row({ i }: { i: number }): React.JSX.Element {\n  return (\n    <>\n      <div data-testid="row" data-date="2026-08-31" />\n      <div data-testid="row" data-index={i} />\n    </>\n  );\n}\n',
        );
        const fixed = runLint();
        expect(fixed.status, fixed.output).toBe(0);
      } finally {
        rmSync(e2eDir, { recursive: true, force: true });
        rmSync(tsxDir, { recursive: true, force: true });
      }
    }, 180_000);
  });
});
