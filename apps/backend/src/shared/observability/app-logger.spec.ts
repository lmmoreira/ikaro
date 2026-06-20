import { AppLogger } from './app-logger';
import { runWithRequestContext } from '../request/request-context';
import { TenantSettings } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';

const SETTINGS = TenantSettings.default().toJSON();

describe('AppLogger', () => {
  let logger: AppLogger;
  let writeSpy: jest.SpyInstance;
  let lastOutput: Record<string, unknown>;

  beforeEach(() => {
    logger = new AppLogger('TestContext');
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lastOutput = JSON.parse(chunk as string) as Record<string, unknown>;
      return true;
    });
  });

  afterEach(() => {
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
});
