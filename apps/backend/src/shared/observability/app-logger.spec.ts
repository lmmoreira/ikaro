import { AppLogger } from './app-logger';

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

  it('log() outputs valid JSON with all mandatory fields', () => {
    logger.log('hello world');

    expect(lastOutput).toMatchObject({
      level: 'INFO',
      service: 'backend',
      context: 'TestContext',
      message: 'hello world',
    });
    expect(typeof lastOutput['timestamp']).toBe('string');
    expect(lastOutput['timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('warn() emits WARN level', () => {
    logger.warn('something suspicious');
    expect(lastOutput['level']).toBe('WARN');
  });

  it('error() emits ERROR level with trace', () => {
    logger.error('boom', 'stack trace here');
    expect(lastOutput['level']).toBe('ERROR');
    expect(lastOutput['trace']).toBe('stack trace here');
  });

  it('debug() emits DEBUG level', () => {
    logger.debug('verbose info');
    expect(lastOutput['level']).toBe('DEBUG');
  });

  it('includes optional context fields when provided', () => {
    logger.log('booking created', { tenantId: 'tenant-1', correlationId: 'corr-1' });
    expect(lastOutput['tenantId']).toBe('tenant-1');
    expect(lastOutput['correlationId']).toBe('corr-1');
    expect(lastOutput['message']).toBe('booking created');
  });

  it('output is parseable JSON — not a plain string', () => {
    logger.log('test');
    expect(() => JSON.parse(writeSpy.mock.calls[0]![0] as string)).not.toThrow();
  });
});
