import { BaseAppLogger } from './app-logger';

class TestLogger extends BaseAppLogger {
  constructor(context?: string) {
    super('test-service', context);
  }
}

class EnrichingTestLogger extends BaseAppLogger {
  constructor(private readonly extra: Record<string, unknown>) {
    super('test-service');
  }

  protected enrich(): Record<string, unknown> {
    return this.extra;
  }
}

describe('BaseAppLogger', () => {
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

  it('log() outputs valid JSON with all mandatory fields', () => {
    new TestLogger('TestContext').log('hello world');

    expect(lastOutput).toMatchObject({
      level: 'INFO',
      service: 'test-service',
      context: 'TestContext',
      message: 'hello world',
    });
    expect(typeof lastOutput['timestamp']).toBe('string');
    expect(lastOutput['timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('warn() emits WARN level', () => {
    new TestLogger().warn('something suspicious');
    expect(lastOutput['level']).toBe('WARN');
  });

  it('error() emits ERROR level with trace', () => {
    new TestLogger().error('boom', 'stack trace here');
    expect(lastOutput['level']).toBe('ERROR');
    expect(lastOutput['trace']).toBe('stack trace here');
  });

  it('debug() emits DEBUG level', () => {
    new TestLogger().debug('verbose info');
    expect(lastOutput['level']).toBe('DEBUG');
  });

  it('verbose() emits VERBOSE level', () => {
    new TestLogger().verbose('extra detail');
    expect(lastOutput['level']).toBe('VERBOSE');
  });

  it('includes optional context fields when provided', () => {
    new TestLogger().log('booking created', { tenantId: 'tenant-1', correlationId: 'corr-1' });
    expect(lastOutput['tenantId']).toBe('tenant-1');
    expect(lastOutput['correlationId']).toBe('corr-1');
    expect(lastOutput['message']).toBe('booking created');
  });

  it('output is parseable JSON — not a plain string', () => {
    new TestLogger().log('test');
    expect(() => JSON.parse(writeSpy.mock.calls[0]![0] as string)).not.toThrow();
  });

  it('setLogLevels() is a no-op (filtering delegated to the log aggregator)', () => {
    expect(() => new TestLogger().setLogLevels(['error'])).not.toThrow();
  });

  it('does not enrich by default', () => {
    new TestLogger().log('plain');
    expect(lastOutput['tenantId']).toBeUndefined();
  });

  it('merges subclass enrich() fields into every entry', () => {
    new EnrichingTestLogger({ tenantId: 'enriched-tenant' }).log('inside request');
    expect(lastOutput['tenantId']).toBe('enriched-tenant');
  });

  it('caller-provided context fields override enriched fields', () => {
    new EnrichingTestLogger({ tenantId: 'enriched-tenant' }).log('override', {
      tenantId: 'caller-tenant',
    });
    expect(lastOutput['tenantId']).toBe('caller-tenant');
  });

  it('caller context cannot spoof core fields (level/service/message/context/trace)', () => {
    new TestLogger('RealContext').log('real message', {
      level: 'HACKED',
      service: 'evil',
      message: 'fake message',
      context: 'fake context',
      trace: 'fake trace',
    });

    expect(lastOutput).toMatchObject({
      level: 'INFO',
      service: 'test-service',
      message: 'real message',
      context: 'RealContext',
    });
    expect(lastOutput['trace']).toBeUndefined();
  });
});
