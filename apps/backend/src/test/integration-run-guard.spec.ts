import { assertIntegrationRunEnvironment } from './integration-run-guard';

describe('assertIntegrationRunEnvironment', () => {
  it('accepts NODE_OPTIONS carrying the flag, alone or among others', () => {
    expect(() => assertIntegrationRunEnvironment('--experimental-vm-modules')).not.toThrow();
    expect(() =>
      assertIntegrationRunEnvironment('--max-old-space-size=5120 --experimental-vm-modules'),
    ).not.toThrow();
  });

  it.each([undefined, '', '--max-old-space-size=5120', '--experimental-vm-modules-extra'])(
    'rejects %p with an actionable message',
    (nodeOptions) => {
      expect(() => assertIntegrationRunEnvironment(nodeOptions)).toThrow(
        /pnpm --filter @ikaro\/backend test:integration/,
      );
    },
  );
});
