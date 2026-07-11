import { AppLogger } from './app-logger';
import { runWithRequestContext } from '../request/request-context';
import { TenantSettings } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';

const SETTINGS = TenantSettings.default().toJSON();

class TestableAppLogger extends AppLogger {
  public formatVendorFieldsForTest(
    traceId: string | null,
    spanId: string | null,
  ): Record<string, unknown> {
    return this.formatVendorFields(traceId, spanId);
  }
}

describe('AppLogger', () => {
  let logger: TestableAppLogger;
  let writeSpy: jest.SpyInstance;
  let lastOutput: Record<string, unknown>;

  beforeEach(() => {
    delete process.env['LOG_VENDOR'];
    delete process.env['GCP_PROJECT'];
    logger = new TestableAppLogger('TestContext');
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lastOutput = JSON.parse(chunk as string) as Record<string, unknown>;
      return true;
    });
  });

  afterEach(() => {
    delete process.env['LOG_VENDOR'];
    delete process.env['GCP_PROJECT'];
    writeSpy.mockRestore();
  });

  it('tags every entry with service: backend', () => {
    logger.log('hello world');
    expect(lastOutput).toMatchObject({ service: 'backend', context: 'TestContext' });
  });

  it('auto-enriches with tenantId and correlationId from AsyncLocalStorage when inside a request', () => {
    runWithRequestContext('tenant-auto', 'corr-auto', SETTINGS, () => {
      logger.log('inside request');
    });
    expect(lastOutput['tenantId']).toBe('tenant-auto');
    expect(lastOutput['correlationId']).toBe('corr-auto');
  });

  it('does not include tenantId when called outside a request context', () => {
    logger.log('outside request');
    expect(lastOutput['tenantId']).toBeUndefined();
  });

  it('caller-provided context fields override auto-enriched fields', () => {
    runWithRequestContext('tenant-auto', 'corr-auto', SETTINGS, () => {
      logger.log('override', { tenantId: 'caller-tenant', correlationId: 'caller-corr' });
    });
    expect(lastOutput['tenantId']).toBe('caller-tenant');
    expect(lastOutput['correlationId']).toBe('caller-corr');
  });

  it('adds Cloud Logging trace fields when GCP_PROJECT is set and trace/span IDs are provided', () => {
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    logger = new TestableAppLogger('TestContext');
    const fields = logger.formatVendorFieldsForTest(
      '0123456789abcdef0123456789abcdef',
      '0123456789abcdef',
    );

    expect(fields['logging.googleapis.com/trace']).toBe(
      'projects/ikaro-staging/traces/0123456789abcdef0123456789abcdef',
    );
    expect(fields['logging.googleapis.com/spanId']).toBe('0123456789abcdef');
  });

  it('omits Cloud Logging trace fields when GCP_PROJECT is unset', () => {
    const fields = logger.formatVendorFieldsForTest(
      '0123456789abcdef0123456789abcdef',
      '0123456789abcdef',
    );

    expect(fields['logging.googleapis.com/trace']).toBeUndefined();
    expect(fields['logging.googleapis.com/spanId']).toBeUndefined();
  });

  it('supports disabling vendor-specific fields via LOG_VENDOR=none', () => {
    process.env['LOG_VENDOR'] = 'none';
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    logger = new TestableAppLogger('TestContext');
    const fields = logger.formatVendorFieldsForTest(
      '0123456789abcdef0123456789abcdef',
      '0123456789abcdef',
    );

    expect(fields).toEqual({});
  });
});
