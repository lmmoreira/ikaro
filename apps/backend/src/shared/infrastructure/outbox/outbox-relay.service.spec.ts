import { ConfigService } from '@nestjs/config';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { IEventBus } from '../../ports/event-bus.port';
import { IInboxRepository } from '../../ports/inbox.port';
import { IOutboxRepository } from '../../ports/outbox-repository.port';
import { ITransactionManager } from '../../ports/transaction-manager.port';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let outboxRepo: jest.Mocked<IOutboxRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let inboxRepo: jest.Mocked<IInboxRepository>;
  let txManager: jest.Mocked<ITransactionManager>;
  let config: ConfigService;

  beforeEach(() => {
    outboxRepo = {
      insert: jest.fn(),
      claimUnpublishedById: jest.fn(),
      markPublished: jest.fn(),
      claimUnpublished: jest.fn(),
      releaseClaim: jest.fn(),
      countUnpublished: jest.fn().mockResolvedValue({ count: 0, oldestAgeSeconds: null }),
      deleteOldPublished: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<IOutboxRepository>;
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
    inboxRepo = {
      hasBeenProcessed: jest.fn(),
      markProcessed: jest.fn(),
      tryClaim: jest.fn(),
      unclaim: jest.fn(),
      deleteOldProcessed: jest.fn().mockResolvedValue(0),
    } as jest.Mocked<IInboxRepository>;
    txManager = {
      run: jest.fn((work) => work()),
      scheduleAfterCommit: jest.fn(),
    } as jest.Mocked<ITransactionManager>;
    config = makeConfigService();
  });

  const createService = (serviceConfig = config): OutboxRelayService =>
    new OutboxRelayService(outboxRepo, eventBus, inboxRepo, serviceConfig, txManager);

  describe('relay(rowIds) — inline dispatch path', () => {
    it('publishes and marks the given row id', async () => {
      outboxRepo.claimUnpublishedById.mockResolvedValue({
        id: 'row-1',
        leaseToken: 'lease-1',
        payload: { eventName: 'X' },
      });

      await createService().relay(['row-1']);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(outboxRepo.claimUnpublishedById).toHaveBeenCalledWith(
        'row-1',
        expect.any(String),
        120,
      );
      expect(outboxRepo.markPublished).toHaveBeenCalledWith('row-1', 'lease-1');
      expect(txManager.run).toHaveBeenCalledTimes(2);
    });

    it('does nothing for a row that is already published or missing', async () => {
      outboxRepo.claimUnpublishedById.mockResolvedValue(null);
      await createService().relay(['row-1']);
      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('swallows a publish failure — relay() never throws', async () => {
      outboxRepo.claimUnpublishedById.mockResolvedValue({
        id: 'row-1',
        leaseToken: 'lease-1',
        payload: { eventName: 'X' },
      });
      eventBus.publish.mockRejectedValue(new Error('pubsub down'));
      await expect(createService().relay(['row-1'])).resolves.toBeUndefined();
    });

    it('is a no-op for an explicitly empty rowIds array — never falls through to sweep+GC', async () => {
      await createService().relay([]);
      expect(outboxRepo.claimUnpublishedById).not.toHaveBeenCalled();
      expect(txManager.run).not.toHaveBeenCalled();
    });
  });

  describe('relay() — sweep + GC path (no rowIds)', () => {
    it('leases in a transaction, publishes outside it, then marks in a second transaction', async () => {
      outboxRepo.claimUnpublished.mockResolvedValue([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
      ]);
      let transactionOpen = false;
      txManager.run.mockImplementation(async (work) => {
        transactionOpen = true;
        try {
          return await work();
        } finally {
          transactionOpen = false;
        }
      });
      eventBus.publish.mockImplementation(async () => {
        expect(transactionOpen).toBe(false);
      });

      await createService().relay();

      expect(outboxRepo.claimUnpublished).toHaveBeenCalledWith(30, 100, expect.any(String), 120);
      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(outboxRepo.markPublished).toHaveBeenCalledWith('row-1', 'lease-1');
      expect(txManager.run).toHaveBeenCalledTimes(3); // short claim, mark, then retention GC
      expect(outboxRepo.countUnpublished).toHaveBeenCalledTimes(1);
      expect(outboxRepo.deleteOldPublished).toHaveBeenCalledTimes(1);
      expect(inboxRepo.deleteOldProcessed).toHaveBeenCalledTimes(1);
    });

    it('releases a failed publish lease and continues the rest of its batch', async () => {
      outboxRepo.claimUnpublished
        .mockResolvedValueOnce([
          { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
          { id: 'row-2', leaseToken: 'lease-2', payload: { eventName: 'Y' } },
        ])
        .mockResolvedValueOnce([]);
      eventBus.publish.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined);

      await expect(createService().relay()).resolves.toBeUndefined();

      expect(outboxRepo.releaseClaim).toHaveBeenCalledWith('row-1', 'lease-1');
      expect(outboxRepo.markPublished).toHaveBeenCalledWith('row-2', 'lease-2');
      expect(eventBus.publish).toHaveBeenCalledTimes(2);
    });

    it('loops when a batch is full', async () => {
      outboxRepo.claimUnpublished
        .mockResolvedValueOnce([
          { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
        ])
        .mockResolvedValueOnce([]);

      await createService(makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 })).relay();

      expect(outboxRepo.claimUnpublished).toHaveBeenCalledTimes(2);
    });

    it('stops after a failed full batch so one tick cannot retry forever', async () => {
      outboxRepo.claimUnpublished.mockResolvedValue([
        { id: 'row-1', leaseToken: 'lease-1', payload: { eventName: 'X' } },
      ]);
      eventBus.publish.mockRejectedValue(new Error('down'));

      await createService(makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 })).relay();

      expect(outboxRepo.claimUnpublished).toHaveBeenCalledTimes(1);
      expect(outboxRepo.releaseClaim).toHaveBeenCalledWith('row-1', 'lease-1');
    });
  });
});
