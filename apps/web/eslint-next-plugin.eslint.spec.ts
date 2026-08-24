import { Linter } from 'eslint';
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
});
