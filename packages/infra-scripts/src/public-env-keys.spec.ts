import { extractPublicEnvKeysFromSource } from './public-env-keys';

describe('extractPublicEnvKeysFromSource', () => {
  it('extracts every string literal from a PUBLIC_ENV_KEYS = [...] as const declaration', () => {
    const source = `
      const PUBLIC_ENV_KEYS = [
        'NEXT_PUBLIC_BFF_URL',
        'NEXT_PUBLIC_SITE_URL',
      ] as const;
    `;

    expect(extractPublicEnvKeysFromSource(source)).toEqual([
      'NEXT_PUBLIC_BFF_URL',
      'NEXT_PUBLIC_SITE_URL',
    ]);
  });

  it('ignores unrelated variables named differently', () => {
    const source = `
      const OTHER_KEYS = ['IGNORED'] as const;
      const PUBLIC_ENV_KEYS = ['REAL'] as const;
    `;

    expect(extractPublicEnvKeysFromSource(source)).toEqual(['REAL']);
  });

  it('throws when no PUBLIC_ENV_KEYS declaration exists', () => {
    const source = `const somethingElse = ['FOO'] as const;`;

    expect(() => extractPublicEnvKeysFromSource(source)).toThrow(/No "PUBLIC_ENV_KEYS/);
  });

  it('handles a single-entry array', () => {
    const source = `const PUBLIC_ENV_KEYS = ['ONLY'] as const;`;

    expect(extractPublicEnvKeysFromSource(source)).toEqual(['ONLY']);
  });

  it('works without the "as const" assertion', () => {
    const source = `const PUBLIC_ENV_KEYS = ['FOO', 'BAR'];`;

    expect(extractPublicEnvKeysFromSource(source)).toEqual(['FOO', 'BAR']);
  });

  it('throws on a non-string-literal element instead of silently dropping it', () => {
    const source = `
      const SOME_KEY = 'DYNAMIC';
      const PUBLIC_ENV_KEYS = [SOME_KEY, 'FOO'] as const;
    `;

    expect(() => extractPublicEnvKeysFromSource(source)).toThrow(/non-string-literal element/);
  });
});
