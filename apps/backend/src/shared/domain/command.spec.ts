import { Command } from './command';

class StubCommand extends Command<{ value: string }> {
  readonly eventVersion = 1;
  readonly data: { value: string };
  constructor(tenantId: string, correlationId: string, data: { value: string }, dedupKey: string) {
    super(tenantId, correlationId, dedupKey);
    this.data = data;
  }
}

describe('Command', () => {
  it('stores the deterministic dedupKey supplied at construction', () => {
    const command = new StubCommand('tenant-1', 'corr-1', { value: 'x' }, 'business-key-1');
    expect(command.dedupKey).toBe('business-key-1');
  });

  it('mints a fresh eventId even when dedupKey is identical across constructions', () => {
    const a = new StubCommand('tenant-1', 'corr-1', { value: 'x' }, 'same-business-key');
    const b = new StubCommand('tenant-1', 'corr-2', { value: 'y' }, 'same-business-key');
    expect(a.eventId).not.toBe(b.eventId);
    expect(a.dedupKey).toBe(b.dedupKey);
  });

  it('serializes dedupKey into JSON like any other field', () => {
    const command = new StubCommand('tenant-1', 'corr-1', { value: 'x' }, 'business-key-1');
    const json = JSON.parse(JSON.stringify(command)) as { dedupKey?: string };
    expect(json.dedupKey).toBe('business-key-1');
  });

  it('inherits the standard envelope fields from Envelope', () => {
    const command = new StubCommand('tenant-1', 'corr-1', { value: 'x' }, 'business-key-1');
    expect(command.tenantId).toBe('tenant-1');
    expect(command.correlationId).toBe('corr-1');
    expect(command.eventName).toBe('StubCommand');
  });
});
