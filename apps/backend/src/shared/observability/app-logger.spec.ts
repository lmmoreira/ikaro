import { AppLogger } from './app-logger';
import { runWithTenantContext } from '../tenant/tenant-context';

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
    runWithTenantContext('tenant-auto', 'corr-auto', () => {
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
    runWithTenantContext('tenant-auto', 'corr-auto', () => {
      logger.log('override', { tenantId: 'caller-tenant', correlationId: 'caller-corr' });
    });
    expect(lastOutput['tenantId']).toBe('caller-tenant');
    expect(lastOutput['correlationId']).toBe('caller-corr');
  });
});
