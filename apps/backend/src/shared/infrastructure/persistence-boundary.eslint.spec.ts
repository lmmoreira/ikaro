import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Linter } from 'eslint';

const backendRoot = resolve(__dirname, '../../..');
const persistenceRuleConfig: Linter.Config = {
  files: ['**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'typeorm',
            importNames: ['EntityManager'],
            message: 'docs/AGENT_PATTERNS.md Pattern #1',
          },
        ],
      },
    ],
  },
};

describe('TD37-S02 persistence boundary', () => {
  const linter = new Linter({ configType: 'flat' });

  it('rejects a persistence API imported by an outbox service', () => {
    const messages = linter.verify(
      "import { EntityManager } from 'typeorm';\nexport { EntityManager };\n",
      persistenceRuleConfig,
      'src/shared/infrastructure/outbox/outbox-publisher.ts',
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'no-restricted-imports',
          message: expect.stringContaining('docs/AGENT_PATTERNS.md Pattern #1'),
        }),
      ]),
    );
  });

  it('lists repository adapters and the reviewed availability adapter as narrow exceptions', () => {
    const config = readFileSync(resolve(backendRoot, 'eslint.config.js'), 'utf8');

    expect(config).toContain("'**/infrastructure/repositories/**'");
    expect(config).toContain(
      "'src/contexts/booking/infrastructure/cross-context/typeorm-booking-availability.adapter.ts'",
    );
    expect(config).not.toContain("'src/shared/infrastructure/**'");
  });
});
