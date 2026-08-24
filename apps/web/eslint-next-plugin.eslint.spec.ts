import { Linter } from 'eslint';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Load the real flat config so this regression test exercises the same blocking rules as CI.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS config under test
const productionConfig = require('./eslint.config.js') as Linter.Config[];

describe('TD37-S18 Next.js lint enforcement', () => {
  const eslint = new Linter({ configType: 'flat' });

  it('blocks a raw img element', () => {
    const messages = eslint.verify('<img src="/logo.png" alt="Logo" />', productionConfig, {
      filename: 'components/Logo.tsx',
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: '@next/next/no-img-element',
          severity: 2,
        }),
      ]),
    );
  });

  it('accepts a Next Image component', () => {
    const messages = eslint.verify(
      "import Image from 'next/image'; export function Logo() { return <Image src='/logo.png' alt='Logo' width={100} height={40} />; }",
      productionConfig,
      { filename: 'components/Logo.tsx' },
    );

    expect(messages.filter((message) => message.ruleId?.startsWith('@next/next/'))).toHaveLength(0);
  });

  it('makes the real web lint command block and then accept the corrected fixture', () => {
    const webDirectory = existsSync(join(process.cwd(), 'apps/web/eslint.config.js'))
      ? join(process.cwd(), 'apps/web')
      : process.cwd();
    const fixtureDirectory = mkdtempSync(join(webDirectory, 'eslint-next-fixture-'));
    const fixturePath = join(fixtureDirectory, 'fixture.tsx');
    const runLint = (): { status: number; output: string } => {
      try {
        execFileSync('pnpm', ['lint'], { cwd: webDirectory, stdio: 'pipe' });
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
    };

    try {
      writeFileSync(fixturePath, '<img src="/logo.png" alt="Logo" />\n');
      expect(runLint().status).not.toBe(0);

      writeFileSync(
        fixturePath,
        'import type React from \'react\';\nimport Image from \'next/image\';\n\nexport function Logo(): React.JSX.Element {\n  return <Image src="/logo.png" alt="Logo" width={100} height={40} />;\n}\n',
      );
      const result = runLint();
      expect(result.status, result.output).toBe(0);
    } finally {
      rmSync(fixtureDirectory, { recursive: true, force: true });
    }
  }, 180_000);
});
