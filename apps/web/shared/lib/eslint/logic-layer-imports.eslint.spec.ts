import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the real flat config rather than copying its rule, like raw-form-control.eslint.spec.ts. An
// `import` of the CommonJS config would make the type-check follow it into untyped files, so
// `require` it.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

const HOOK_PATH = 'features/booking/hooks/useExample.ts';
const MODEL_PATH = 'features/booking/model/example.ts';
const SHELL_MODEL_PATH = 'shells/dashboard/model/example.ts';

describe('hooks/ and model/ do not import from components/ (TD58-S14)', () => {
  const eslint = new Linter({ configType: 'flat' });

  // Only the layering rule's own messages: the fixtures are not full modules, so other rules stay out.
  function layeringMessages(source: string, filePath: string) {
    return eslint
      .verify(source, productionConfig, filePath)
      .filter((message) => message.ruleId === 'no-restricted-imports');
  }

  describe('flags an import that runs through a components/ directory', () => {
    it.each([
      ['a relative import', "import { a } from '../components/public/ConfirmationStep';"],
      ['a same-folder relative import', "import { a } from './components/Example';"],
      ['a barrel (the directory itself)', "import { a } from '../../components';"],
      ['an alias import', "import { a } from '@/features/booking/components/public/Example';"],
      [
        'a shell component',
        "import { a } from '@/shells/dashboard/components/topbar-status-context';",
      ],
      ['a type-only import', "import type { A } from '../components/public/ConfirmationStep';"],
      ['an export-from', "export { a } from '../components/public/ConfirmationStep';"],
      ['an export-all', "export * from '../components/public/ConfirmationStep';"],
    ])('%s', (_name, source) => {
      for (const path of [HOOK_PATH, MODEL_PATH, SHELL_MODEL_PATH]) {
        expect(layeringMessages(source, path)).toHaveLength(1);
      }
    });
  });

  describe('allows what is not a components/ import', () => {
    it.each([
      [
        'a shared ui primitive by alias',
        "import type { A } from '@/shared/components/ui/feedback-message';",
      ],
      [
        'a shared ui primitive by relative path',
        "import type { A } from '../../../shared/components/ui/feedback-message';",
      ],
      ['a model import', "import { a } from '@/features/booking/model/booking-payload';"],
      ['a folder merely named like components', "import { a } from '../components-helper/x';"],
    ])('%s', (_name, source) => {
      for (const path of [HOOK_PATH, MODEL_PATH, SHELL_MODEL_PATH]) {
        expect(layeringMessages(source, path)).toHaveLength(0);
      }
    });

    it.each([
      ['a spec file in hooks/', 'features/booking/hooks/useExample.spec.ts'],
      ['a spec file in model/', 'features/booking/model/example.spec.ts'],
    ])('%s (a spec mocks a component path on purpose)', (_name, path) => {
      expect(layeringMessages("import { a } from '../components/Example';", path)).toHaveLength(0);
    });

    it('does not apply to a components/ file or an app route', () => {
      const source = "import { a } from '../components/Example';";

      expect(layeringMessages(source, 'features/booking/components/example.tsx')).toHaveLength(0);
      expect(layeringMessages(source, 'app/dashboard/example/page.tsx')).toHaveLength(0);
    });
  });
});
