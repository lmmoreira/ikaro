import { ConfigService } from '@nestjs/config';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { InMemoryEventBus } from '../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryOutboxRepository } from '../../../test/infrastructure/in-memory-outbox.repository';
import { InMemoryTransactionManager } from '../../../test/infrastructure/in-memory-transaction-manager';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let outboxRepo: InMemoryOutboxRepository;
  let eventBus: InMemoryEventBus;
  let inboxRepo: InMemoryInboxRepository;
  let txManager: InMemoryTransactionManager;
  let config: ConfigService;

  beforeEach(() => {
    outboxRepo = new InMemoryOutboxRepository();
    eventBus = new InMemoryEventBus();
    inboxRepo = new InMemoryInboxRepository();
    txManager = new InMemoryTransactionManager();
    config = makeConfigService();
  });

  const createService = (serviceConfig = config): OutboxRelayService =>
    new OutboxRelayService(outboxRepo, eventBus, inboxRepo, serviceConfig, txManager);

  describe('relay(rowIds) — inline dispatch path', () => {
    it('publishes and marks the given row id', async () => {
      outboxRepo.setNextClaimByIdResult({
        id: 'row-1',
        leaseToken: 'lease-1',
        payload: { eventName: 'X' },
      });

      await createService().relay(['row-1']);

      expect(eventBus.publishCallCount).toBe(1);
      expect(outboxRepo.claimedById).toEqual([
        { id: 'row-1', leaseToken: expect.any(String), leaseSeconds: 120 },
      ]);
      expect(outboxRepo.markedPublished).toEqual([{ id: 'row-1', leaseToken: 'lease-1' }]);
      expect(txManager.runCallCount).toBe(2);
    });

    it('does nothing for a row that is already published or missing', async () => {
      outboxRepo.setNextClaimByIdResult(null);
      await createService().relay(['row-1']);
      expect(eventBus.publishCallCount).toBe(0);
    });

    it('swallows a publish failure — relay() never throws', async () => {
      outboxRepo.setNextClaimByIdResult({
        id: 'row-1',
        leaseToken: 'lease-1',
        payload: { eventName: 'X' },
      });
      eventBus.failNextPublish(new Error('pubsub down'));
      await expect(createService().relay(['row-1'])).resolves.toBeUndefined();
    });

    it('is a no-op for an explicitly empty rowIds array — never falls through to sweep+GC', async () => {
      await createService().relay([]);
      expect(outboxRepo.claimedById).toHaveLength(0);
      expect(txManager.runCallCount).toBe(0);
    });
  });

  describe('relay() — sweep + GC path (no rowIds)', () => {
    it('leases in a transaction, publishes outside it, then marks in a second transaction', async () => {
      outboxRepo.setSweepDefaultResult([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
      ]);
      eventBus.onPublish = () => {
        expect(txManager.isInTransaction).toBe(false);
      };

      await createService().relay();

      expect(outboxRepo.swept).toEqual([
        { graceSeconds: 30, batchSize: 100, leaseToken: expect.any(String), leaseSeconds: 120 },
      ]);
      expect(eventBus.publishCallCount).toBe(1);
      expect(outboxRepo.markedPublished).toEqual([{ id: 'row-1', leaseToken: 'lease-1' }]);
      expect(txManager.runCallCount).toBe(3); // short claim, mark, then retention GC
      expect(outboxRepo.countUnpublishedCallCount).toBe(1);
      expect(outboxRepo.deleteOldPublishedCallCount).toBe(1);
      expect(inboxRepo.deleteOldProcessedCallCount).toBe(1);
    });

    it('releases a failed publish lease and continues the rest of its batch', async () => {
      outboxRepo.queueSweepResult([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
        { id: 'row-2', leaseToken: 'lease-2', payload: { eventName: 'Y' } },
      ]);
      outboxRepo.queueSweepResult([]);
      eventBus.failNextPublish(new Error('down'));

      await expect(createService().relay()).resolves.toBeUndefined();

      expect(outboxRepo.releasedClaims).toEqual([{ id: 'row-1', leaseToken: 'lease-1' }]);
      expect(outboxRepo.markedPublished).toEqual([{ id: 'row-2', leaseToken: 'lease-2' }]);
      expect(eventBus.publishCallCount).toBe(2);
    });

    it('loops when a batch is full', async () => {
      outboxRepo.queueSweepResult([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
      ]);
      outboxRepo.queueSweepResult([]);

      await createService(makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 })).relay();

      expect(outboxRepo.swept).toHaveLength(2);
    });

    it('stops after a failed full batch so one tick cannot retry forever', async () => {
      outboxRepo.setSweepDefaultResult([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
      ]);
      // Every publish() call fails for this test — failNextPublish covers the loop's one attempt
      // since relay() stops sweeping after a failed full batch (see the test name/assertion below).
      eventBus.failNextPublish(new Error('down'));

      await createService(makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 })).relay();

      expect(outboxRepo.swept).toHaveLength(1);
      expect(outboxRepo.releasedClaims).toEqual([{ id: 'row-1', leaseToken: 'lease-1' }]);
    });
  });
});
