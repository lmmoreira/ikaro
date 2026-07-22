import { Envelope } from './envelope';

class StubEnvelope extends Envelope<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }) {
    super(tenantId, correlationId);
    this.data = data;
  }
}

describe('Envelope', () => {
  it('generates a fresh eventId per construction', () => {
    const a = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    const b = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    expect(a.eventId).not.toBe(b.eventId);
  });

  it('carries tenantId and correlationId through unchanged', () => {
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    expect(event.tenantId).toBe('tenant-1');
    expect(event.correlationId).toBe('corr-1');
  });

  it('sets occurredAt to an ISO-8601 timestamp at construction time', () => {
    const before = Date.now();
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    const after = Date.now();
    const occurredAtMs = new Date(event.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(occurredAtMs).toBeLessThanOrEqual(after);
  });

  it('derives eventName from the concrete subclass name', () => {
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    expect(event.eventName).toBe('StubEnvelope');
  });

  it('serializes into JSON with all envelope fields plus data', () => {
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    const json = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    expect(json).toMatchObject({
      eventId: event.eventId,
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      eventName: 'StubEnvelope',
      eventVersion: 1,
      data: { value: 'x' },
    });
  });

  it('has no traceContext until one is set (TD28)', () => {
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    expect(event.traceContext).toBeUndefined();
  });

  it('carries an assigned traceContext through JSON serialization (TD28)', () => {
    const event = new StubEnvelope('tenant-1', 'corr-1', { value: 'x' });
    event.traceContext = { traceparent: '00-abc-def-01' };

    const json = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    expect(json['traceContext']).toEqual({ traceparent: '00-abc-def-01' });
  });
});
