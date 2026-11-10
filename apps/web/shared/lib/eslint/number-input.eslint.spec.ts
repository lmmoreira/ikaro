import { resolve } from 'node:path';
import { Linter } from 'eslint';

const webRoot = resolve(__dirname, '../../..');
// Load the real flat config rather than copying its selectors, like raw-form-control.eslint.spec.ts
// (a `require`, so the type-check does not follow an `import` into the untyped base config).
// eslint-disable-next-line @typescript-eslint/no-require-imports -- load the real CommonJS flat config in this ESLint regression test
const productionConfig = require(resolve(webRoot, 'eslint.config.js')) as Linter.Config[];

const DASHBOARD_PATH = 'features/booking/components/dashboard/example.tsx';
// A tenant-branded tree: exempt from the raw-control ban, but not from this one.
const BRANDED_PATH = 'features/booking/components/public/example.tsx';
const PRIMITIVE_PATH = 'shared/components/ui/number-input.tsx';

describe('bare numeric <Input> ban (TD51-S3)', () => {
  const eslint = new Linter({ configType: 'flat' });

  // Only this rule's own message: the fixtures are not full components, so unrelated rules stay out.
  function numberInputMessages(source: string, filePath: string) {
    return eslint
      .verify(source, productionConfig, filePath)
      .filter(
        (message) =>
          message.ruleId === 'no-restricted-syntax' && message.message.includes('TD51-S3'),
      );
  }

  function component(body: string): string {
    return `export function Example(): React.JSX.Element { return (${body}); }`;
  }

  describe('flags a numeric <Input> without the primitive', () => {
    it.each([
      ['type="number"', '<Input type="number" />'],
      ["type={'number'}", "<Input type={'number'} />"],
      ['type={`number`}', '<Input type={`number`} />'],
      ['a conditional type', "<Input type={flag ? 'number' : 'text'} />"],
      ['a logical type', "<Input type={flag && 'number'} />"],
      ['a number input with other props', '<Input id="a" type="number" min={0} value={1} />'],
    ])('%s', (_name, jsx) => {
      for (const path of [DASHBOARD_PATH, BRANDED_PATH]) {
        const messages = numberInputMessages(component(jsx), path);

        expect(messages).toHaveLength(1);
        expect(messages[0].message).toContain('ui/number-input');
      }
    });

    it('flags a folder the rule has never heard of (it fails closed)', () => {
      const messages = numberInputMessages(
        component('<Input type="number" />'),
        'features/staff/components/brand-new-folder/example.tsx',
      );

      expect(messages).toHaveLength(1);
    });

    it('flags a numeric <Input> inside the other ui primitives', () => {
      const messages = numberInputMessages(
        component('<Input type="number" />'),
        'shared/components/ui/some-other-primitive.tsx',
      );

      expect(messages).toHaveLength(1);
    });
  });

  describe('allows', () => {
    it.each([
      ['a text <Input>', '<Input type="text" />'],
      ['an <Input> with no type', '<Input />'],
      ['a tel <Input>', '<Input type="tel" inputMode="numeric" />'],
      ['<NumberInput>', '<NumberInput unit="min" />'],
      ['a different attribute named number', '<Input inputMode="number" />'],
      ['a number type on another element', '<Foo type="number" />'],
      [
        'a conditional that only tests for number',
        "<Input type={x === 'number' ? 'text' : 'tel'} />",
      ],
    ])('%s', (_name, jsx) => {
      expect(numberInputMessages(component(jsx), DASHBOARD_PATH)).toEqual([]);
    });

    it('the primitive file, by exact path', () => {
      expect(numberInputMessages(component('<Input type="number" />'), PRIMITIVE_PATH)).toEqual([]);
    });

    it('a spec file, which the production selectors never scan', () => {
      expect(
        numberInputMessages(
          component('<Input type="number" />'),
          'features/booking/components/dashboard/example.spec.tsx',
        ),
      ).toEqual([]);
    });
  });

  it('leaves the other bans in force for the primitive (the replace-not-merge trap)', () => {
    const messages = eslint
      .verify(
        `export const x = fetch('/api');\n${component('<button type="button" />')}`,
        productionConfig,
        PRIMITIVE_PATH,
      )
      .filter((message) => message.ruleId === 'no-restricted-syntax');

    // A raw fetch stays banned there; the raw <button> ban is lifted for ui/** (TD58-S10 does not
    // exempt buttons, so it is reported too).
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((message) => message.message.includes('fetch'))).toBe(true);
  });
});
