import { AppLogger } from './app-logger';
import { runWithRequestContext } from '../request/request-context';
import { TenantSettings } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';

const SETTINGS = TenantSettings.default().toJSON();

describe('AppLogger', () => {
  let logger: AppLogger;
  let writeSpy: jest.SpyInstance;
  let lastOutput: Record<string, unknown>;

  beforeEach(() => {
    delete process.env['GCP_PROJECT'];
    logger = new AppLogger('TestContext');
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lastOutput = JSON.parse(chunk as string) as Record<string, unknown>;
      return true;
    });
  });

  afterEach(() => {
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

  it('adds Cloud Logging trace fields only when GCP_PROJECT is set and a span is active', () => {
    process.env['GCP_PROJECT'] = 'ikaro-staging';
    const fields = (
      logger as unknown as {
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

  it('omits Cloud Logging trace fields when GCP_PROJECT is unset', () => {
    const fields = (
      logger as unknown as {
        formatVendorFields: (
          traceId: string | null,
          spanId: string | null,
        ) => Record<string, unknown>;
      }
    ).formatVendorFields('0123456789abcdef0123456789abcdef', '0123456789abcdef');

    expect(fields['logging.googleapis.com/trace']).toBeUndefined();
    expect(fields['logging.googleapis.com/spanId']).toBeUndefined();
  });
});
