import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the real flat config rather than copying its selectors, like raw-form-control.eslint.spec.ts
// (a `require`, so the type-check does not follow an `import` into the untyped base config).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

const PUBLIC_PATH = 'features/booking/components/public/example.tsx';
const BRANDED_PATH = 'features/platform/components/public/example.tsx';
const SHELL_PATH = 'shells/hotsite/components/BrandCard.tsx';
const HELPER_PATH = 'shared/components/hotsite/branded-surface-style.ts';
const PAIRED_SHELL_PATH = 'shells/hotsite/components/Footer.tsx';
// A paired shell file that is also a reviewed raw-fetch file and a raw-control-exempt path.
const FETCH_SHELL_PATH = 'shells/hotsite/components/HotsiteAuthBar.tsx';

describe('secondary-colour surface ban (TD51-S05)', () => {
  const eslint = new Linter({ configType: 'flat' });

  function surfaceMessages(source: string, filePath: string) {
    return eslint
      .verify(source, productionConfig, filePath)
      .filter(
        (message) =>
          message.ruleId === 'no-restricted-syntax' &&
          message.message.includes('hand-written secondary-colour surface'),
      );
  }

  function style(declaration: string): string {
    return `export const example = { ${declaration} };`;
  }

  describe('flags the raw secondary background', () => {
    it.each([
      ['a string value', "backgroundColor: 'var(--ba-secondary)'"],
      ['a template literal with no expression', 'backgroundColor: `var(--ba-secondary)`'],
      ['a quoted key', "'backgroundColor': 'var(--ba-secondary)'"],
      ['a computed literal key', "['backgroundColor']: 'var(--ba-secondary)'"],
      ['the background shorthand', "background: 'var(--ba-secondary)'"],
      ['a nullish fallback', "backgroundColor: cardBg ?? 'var(--ba-secondary)'"],
      ['a conditional', "backgroundColor: flag ? 'var(--ba-secondary)' : 'var(--ba-background)'"],
      ['a logical expression', "backgroundColor: flag && 'var(--ba-secondary)'"],
    ])('%s', (_name, declaration) => {
      for (const path of [PUBLIC_PATH, BRANDED_PATH, SHELL_PATH]) {
        const messages = surfaceMessages(style(declaration), path);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain('BrandedPanel');
        expect(messages[0].message).toContain('brandedFieldStyle');
      }
    });

    it('flags a folder the rule has never heard of (it fails closed)', () => {
      const messages = surfaceMessages(
        style("backgroundColor: 'var(--ba-secondary)'"),
        'features/staff/components/brand-new-folder/example.tsx',
      );

      expect(messages).toHaveLength(1);
    });

    it('flags a file in shells/hotsite that is not on the reviewed list', () => {
      expect(
        surfaceMessages(style("backgroundColor: 'var(--ba-secondary)'"), SHELL_PATH),
      ).toHaveLength(1);
    });
  });

  describe('leaves the allowed forms alone', () => {
    it.each([
      ['a border colour', "borderColor: 'var(--ba-secondary)'"],
      ['another background token', "backgroundColor: 'var(--ba-background)'"],
      ['the derived section card token', "backgroundColor: 'var(--ba-section-card-bg)'"],
      ['a spread of the shared surface style', '...brandedSurfaceStyle'],
      ['a different property holding the value', "outlineColor: 'var(--ba-secondary)'"],
    ])('%s', (_name, declaration) => {
      expect(surfaceMessages(style(declaration), PUBLIC_PATH)).toHaveLength(0);
    });
  });

  describe('exempts only the reviewed files, by exact path', () => {
    it.each([
      ['the shared helper', HELPER_PATH],
      ['a shell file that pairs the colour with the derived tokens', PAIRED_SHELL_PATH],
      ['a paired shell file that is also a reviewed raw-fetch file', FETCH_SHELL_PATH],
      ['module-styles.ts', 'features/platform/hotsite/module-styles.ts'],
    ])('%s', (_name, path) => {
      expect(surfaceMessages(style("backgroundColor: 'var(--ba-secondary)'"), path)).toHaveLength(
        0,
      );
    });

    it('keeps every other ban on an exempt file (replace-not-merge proven)', () => {
      const source = "export const load = () => fetch('/api/example');";
      const messages = eslint
        .verify(source, productionConfig, PAIRED_SHELL_PATH)
        .filter((message) => message.ruleId === 'no-restricted-syntax');

      expect(messages.length).toBeGreaterThan(0);
    });

    it('keeps the secondary-surface ban on the same folder when the file is not listed', () => {
      expect(
        surfaceMessages(
          style("backgroundColor: 'var(--ba-secondary)'"),
          'shells/hotsite/components/TestimonialCard.tsx',
        ),
      ).toHaveLength(1);
    });
  });
});
