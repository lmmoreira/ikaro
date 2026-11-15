import { Command } from '../domain/command';
import { Envelope } from '../domain/envelope';
import { IOutboxPublisher } from '../ports/outbox-publisher.port';
import { InMemoryOutboxPublisher } from '../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../test/infrastructure/in-memory-transaction-manager';
import { OUTBOX_PUBLISH_CHUNK_SIZE, publishToOutboxInChunks } from './publish-to-outbox-in-chunks';

class TestCommand extends Command {
  readonly eventVersion = 1;
  readonly data = {};

  constructor(dedupKey: string) {
    super('aaaaaaaa-0010-4000-8000-000000000001', 'corr-1', dedupKey);
  }
}

const envelopes = (count: number): TestCommand[] =>
  Array.from({ length: count }, (_, index) => new TestCommand(`k${index}`));

const dedupKeys = (published: Envelope[]): string[] =>
  published.map((envelope) => (envelope as TestCommand).dedupKey);

class FailingOnPublisher implements IOutboxPublisher {
  constructor(
    private readonly inner: InMemoryOutboxPublisher,
    private readonly failOnDedupKey: string,
  ) {}

  async publish(event: Envelope): Promise<void> {
    if ((event as TestCommand).dedupKey === this.failOnDedupKey)
      throw new Error('outbox insert failed');
    await this.inner.publish(event);
  }
}

describe('publishToOutboxInChunks', () => {
  let txManager: InMemoryTransactionManager;
  let outbox: InMemoryOutboxPublisher;

  beforeEach(() => {
    txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
  });

  it('opens no transaction for an empty list', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, []);

    expect(txManager.runCallCount).toBe(0);
    expect(outbox.published).toEqual([]);
  });

  it('uses one transaction for a list that fits one chunk', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(3), 3);

    expect(txManager.runCallCount).toBe(1);
    expect(outbox.published).toHaveLength(3);
  });

  it('uses exactly N transactions for an exact multiple of the chunk size', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(6), 2);

    expect(txManager.runCallCount).toBe(3);
    expect(outbox.published).toHaveLength(6);
  });

  it('writes the remainder in a last, smaller chunk', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(5), 2);

    expect(txManager.runCallCount).toBe(3);
    expect(outbox.published).toHaveLength(5);
  });

  it('publishes every envelope exactly once, in input order', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(5), 2);

    expect(dedupKeys(outbox.published)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });

  it('keeps the chunks already committed and rethrows when a later chunk fails', async () => {
    const failing = new FailingOnPublisher(outbox, 'k2');

    await expect(
      publishToOutboxInChunks({ txManager, outboxPublisher: failing }, envelopes(5), 2),
    ).rejects.toThrow('outbox insert failed');

    expect(dedupKeys(outbox.published)).toEqual(['k0', 'k1']);
  });

  it('defaults to a chunk of 500', async () => {
    await publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(501));

    expect(OUTBOX_PUBLISH_CHUNK_SIZE).toBe(500);
    expect(txManager.runCallCount).toBe(2);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects a chunk size of %p', async (chunkSize) => {
    await expect(
      publishToOutboxInChunks({ txManager, outboxPublisher: outbox }, envelopes(1), chunkSize),
    ).rejects.toThrow(RangeError);
  });
});
