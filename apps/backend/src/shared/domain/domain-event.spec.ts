import { DomainEvent } from './domain-event';

class StubEvent extends DomainEvent<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }, dedupKey?: string) {
    super(tenantId, correlationId);
    this.data = data;
    if (dedupKey !== undefined) (this as { dedupKey?: string }).dedupKey = dedupKey;
  }
}

describe('DomainEvent / dedupKey', () => {
  it('defaults to undefined when not set by the subclass', () => {
    const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });
    expect(event.dedupKey).toBeUndefined();
  });

  it('is readable when a subclass sets a deterministic business key', () => {
    const event = new StubEvent(
      'tenant-1',
      'corr-1',
      { value: 'x' },
      'PointsExpiringSoon:tenant-1:cust-1:2026-07-11',
    );
    expect(event.dedupKey).toBe('PointsExpiringSoon:tenant-1:cust-1:2026-07-11');
  });

  it('serializes into JSON like any other field', () => {
    const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' }, 'business-key-1');
    const json = JSON.parse(JSON.stringify(event)) as { dedupKey?: string };
    expect(json.dedupKey).toBe('business-key-1');
  });
});
