import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { IEventBus } from '../../ports/event-bus.port';
import { IInboxRepository } from '../../ports/inbox.port';
import { IOutboxRepository } from '../../ports/outbox-repository.port';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let outboxRepo: jest.Mocked<IOutboxRepository>;
  let eventBus: jest.Mocked<IEventBus>;
  let inboxRepo: jest.Mocked<IInboxRepository>;
  let config: ConfigService;

  beforeEach(() => {
    outboxRepo = {
      insert: jest.fn(),
      findUnpublishedById: jest.fn(),
      markPublished: jest.fn(),
      claimUnpublished: jest.fn(),
      runInTransaction: jest.fn(),
      deleteOldPublished: jest.fn(),
    } as unknown as jest.Mocked<IOutboxRepository>;
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<IEventBus>;
    inboxRepo = {
      hasBeenProcessed: jest.fn(),
      markProcessed: jest.fn(),
      deleteOldProcessed: jest.fn(),
    } as unknown as jest.Mocked<IInboxRepository>;
    config = makeConfigService();
  });

  describe('relay(rowIds) — inline dispatch path', () => {
    it('publishes and marks the given row id', async () => {
      outboxRepo.findUnpublishedById.mockResolvedValue({
        id: 'row-1',
        payload: { eventName: 'X' },
      });
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await service.relay(['row-1']);

      expect(eventBus.publish).toHaveBeenCalledTimes(1);
      expect(outboxRepo.markPublished).toHaveBeenCalledWith('row-1');
    });

    it('does nothing for a row that is already published or missing', async () => {
      outboxRepo.findUnpublishedById.mockResolvedValue(null);
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await service.relay(['row-1']);

      expect(eventBus.publish).not.toHaveBeenCalled();
    });

    it('swallows a publish failure — relay() never throws', async () => {
      outboxRepo.findUnpublishedById.mockResolvedValue({
        id: 'row-1',
        payload: { eventName: 'X' },
      });
      eventBus.publish.mockRejectedValue(new Error('pubsub down'));
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await expect(service.relay(['row-1'])).resolves.toBeUndefined();
    });

    it('processes multiple row ids independently', async () => {
      outboxRepo.findUnpublishedById
        .mockResolvedValueOnce({ id: 'row-1', payload: { eventName: 'X' } })
        .mockResolvedValueOnce({ id: 'row-2', payload: { eventName: 'Y' } });
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await service.relay(['row-1', 'row-2']);

      expect(eventBus.publish).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for an explicitly empty rowIds array — never falls through to sweep+GC', async () => {
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await service.relay([]);

      expect(outboxRepo.findUnpublishedById).not.toHaveBeenCalled();
      expect(outboxRepo.runInTransaction).not.toHaveBeenCalled();
      expect(eventBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('relay() — sweep + GC path (no rowIds)', () => {
    it('runs the sweep inside a transaction, stops once a batch is empty, then runs retention GC', async () => {
      const manager = {} as EntityManager;
      outboxRepo.runInTransaction.mockImplementation((work) => work(manager));
      outboxRepo.claimUnpublished.mockResolvedValue([]);
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await service.relay();

      expect(outboxRepo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(outboxRepo.claimUnpublished).toHaveBeenCalledWith(
        manager,
        expect.any(Number),
        expect.any(Number),
      );
      expect(outboxRepo.deleteOldPublished).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
      );
      expect(inboxRepo.deleteOldProcessed).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('loops again when a batch comes back full (more rows may remain)', async () => {
      const manager = {} as EntityManager;
      outboxRepo.runInTransaction.mockImplementation((work) => work(manager));
      outboxRepo.claimUnpublished
        .mockResolvedValueOnce([{ id: 'row-1', payload: { eventName: 'X' } }]) // full "batch" of size 1 == batchSize below
        .mockResolvedValueOnce([]); // second iteration: empty, stop
      const configWithBatchSizeOne = makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 });
      const service = new OutboxRelayService(
        outboxRepo,
        eventBus,
        inboxRepo,
        configWithBatchSizeOne,
      );

      await service.relay();

      expect(outboxRepo.runInTransaction).toHaveBeenCalledTimes(2);
    });

    it('a per-row publish failure during the sweep does not stop the rest of the batch', async () => {
      const manager = {} as EntityManager;
      outboxRepo.runInTransaction.mockImplementation((work) => work(manager));
      outboxRepo.claimUnpublished.mockResolvedValue([
        { id: 'row-1', payload: { eventName: 'X' } },
        { id: 'row-2', payload: { eventName: 'Y' } },
      ]);
      eventBus.publish.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined);
      const service = new OutboxRelayService(outboxRepo, eventBus, inboxRepo, config);

      await expect(service.relay()).resolves.toBeUndefined();

      expect(eventBus.publish).toHaveBeenCalledTimes(2);
      expect(outboxRepo.markPublished).toHaveBeenCalledTimes(1);
      expect(outboxRepo.markPublished).toHaveBeenCalledWith('row-2', manager);
    });
  });
});
