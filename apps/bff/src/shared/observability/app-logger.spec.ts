import { AppLogger } from './app-logger';

describe('AppLogger', () => {
  let writeSpy: jest.SpyInstance;
  let lastOutput: Record<string, unknown>;

  beforeEach(() => {
    delete process.env['GCP_PROJECT'];
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lastOutput = JSON.parse(chunk as string) as Record<string, unknown>;
      return true;
    });
  });

  afterEach(() => {
    delete process.env['GCP_PROJECT'];
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

  it('adds Cloud Logging trace fields when GCP_PROJECT is set and a span is active', () => {
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    const fields = (
      new AppLogger() as unknown as {
        formatVendorFields: (
          traceId: string | null,
          spanId: string | null,
        ) => Record<string, unknown>;
      }
    ).formatVendorFields('0123456789abcdef0123456789abcdef', '0123456789abcdef');

    expect(fields['logging.googleapis.com/trace']).toBe(
      'projects/ikaro-staging/traces/0123456789abcdef0123456789abcdef',
    );
    expect(fields['logging.googleapis.com/spanId']).toBe('0123456789abcdef');
  });
});
