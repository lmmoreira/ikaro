import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the real flat config rather than copying its rule, like logic-layer-imports.eslint.spec.ts.
// An `import` of the CommonJS config would make the type-check follow it into untyped files, so
// `require` it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

const UI_PATH = 'shared/components/ui/example.tsx';
const NESTED_UI_PATH = 'shared/components/ui/nested/deep/example.tsx';

describe('shared/components/ui/** does not import upward (TD58-S15)', () => {
  const eslint = new Linter({ configType: 'flat' });

  // Only the layering rule's own messages: the fixtures are not full modules, so other rules stay out.
  function layeringMessages(source: string, filePath: string) {
    return eslint
      .verify(source, productionConfig, filePath)
      .filter((message) => message.ruleId === 'no-restricted-imports');
  }

  describe('flags an import of a layer above the primitives', () => {
    it.each([
      ['a feature by alias', "import { a } from '@/features/booking/model/example';"],
      ['a shell by alias', "import { a } from '@/shells/dashboard/components/Example';"],
      ['a provider by alias', "import { a } from '@/providers/example';"],
      ['an app route by alias', "import { a } from '@/app/dashboard/example';"],
      ['an app-local i18n helper by alias', "import { a } from '@/i18n/example';"],
      ['a feature by a relative path', "import { a } from '../../../features/booking/model/x';"],
      ['a shell by a relative path', "import { a } from '../../../shells/dashboard/x';"],
      ['a provider by a relative path', "import { a } from '../../../providers/x';"],
      ['an app route by a relative path', "import { a } from '../../../app/x';"],
      ['an i18n helper by a relative path', "import { a } from '../../../i18n/x';"],
      ['a barrel (the directory itself)', "import { a } from '@/features';"],
      [
        'a relative path with a redundant segment',
        "import { a } from '../../../shared/../features/booking/model/example';",
      ],
      [
        'an alias path with a redundant segment',
        "import { a } from '@/shared/../features/booking/model/example';",
      ],
      ['a type-only import', "import type { A } from '@/features/booking/model/example';"],
      ['an export-from', "export { a } from '@/shells/dashboard/example';"],
      ['an export-all', "export * from '../../../features/booking/model/example';"],
    ])('%s', (_name, source) => {
      for (const path of [UI_PATH, NESTED_UI_PATH]) {
        expect(layeringMessages(source, path)).toHaveLength(1);
      }
    });
  });

  describe('allows what is at or below the primitives', () => {
    it.each([
      ['shared/lib by alias', "import { a } from '@/shared/lib/utils';"],
      ['a sibling primitive by alias', "import { a } from '@/shared/components/ui/button';"],
      ['a sibling primitive by a ./ path', "import { a } from './button';"],
      ['a sibling primitive by a ../ path', "import { a } from '../button';"],
      ['a normalised climb of several levels', "import { a } from '../../../shared/lib/utils';"],
      ['a package', "import { a } from 'next-intl';"],
      ['a folder merely named like a layer', "import { a } from '../features-helper/x';"],
    ])('%s', (_name, source) => {
      for (const path of [UI_PATH, NESTED_UI_PATH]) {
        expect(layeringMessages(source, path)).toHaveLength(0);
      }
    });

    it.each([
      ['a spec file in ui/', 'shared/components/ui/example.spec.tsx'],
      ['a spec .ts file in ui/', 'shared/components/ui/example.spec.ts'],
    ])('%s (a spec may mock an upper layer on purpose)', (_name, path) => {
      expect(layeringMessages("import { a } from '@/features/booking/x';", path)).toHaveLength(0);
    });

    it('does not apply to the hotsite components, a feature file or an app route', () => {
      const source = "import { a } from '@/features/booking/model/example';";

      expect(layeringMessages(source, 'shared/components/hotsite/example.tsx')).toHaveLength(0);
      expect(layeringMessages(source, 'shared/components/example.tsx')).toHaveLength(0);
      expect(layeringMessages(source, 'features/platform/components/example.tsx')).toHaveLength(0);
      expect(layeringMessages(source, 'app/dashboard/example/page.tsx')).toHaveLength(0);
    });
  });
});
