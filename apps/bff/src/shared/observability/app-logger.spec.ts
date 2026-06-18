import { AppLogger } from './app-logger';

describe('AppLogger', () => {
  let writeSpy: jest.SpyInstance;
  let lastOutput: Record<string, unknown>;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lastOutput = JSON.parse(chunk as string) as Record<string, unknown>;
      return true;
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('tags every entry with service: bff', () => {
    new AppLogger('TestContext').log('hello world');
    expect(lastOutput).toMatchObject({ service: 'bff', context: 'TestContext' });
  });

  it('does not auto-enrich with tenant fields (no tenant context in bff)', () => {
    new AppLogger().log('plain');
    expect(lastOutput['tenantId']).toBeUndefined();
  });
});
