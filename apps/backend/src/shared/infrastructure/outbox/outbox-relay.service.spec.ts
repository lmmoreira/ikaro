import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { makeConfigService } from '../../../test/infrastructure/fake-config-service';
import { GcpPubSubEventBusAdapter } from '../gcp-pubsub-event-bus.adapter';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxRelayService } from './outbox-relay.service';

describe('OutboxRelayService', () => {
  let repo: jest.Mocked<Repository<OutboxEventEntity>>;
  let innerBus: jest.Mocked<GcpPubSubEventBusAdapter>;
  let config: ConfigService;

  beforeEach(() => {
    repo = {
      query: jest.fn(),
      manager: { transaction: jest.fn() },
    } as unknown as jest.Mocked<Repository<OutboxEventEntity>>;
    innerBus = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<GcpPubSubEventBusAdapter>;
    config = makeConfigService();
  });

  describe('relay(rowIds) — inline dispatch path', () => {
    it('publishes and marks the given row id', async () => {
      repo.query
        .mockResolvedValueOnce([{ id: 'row-1', payload: { eventName: 'X' } }])
        .mockResolvedValueOnce(undefined);
      const service = new OutboxRelayService(repo, innerBus, config);

      await service.relay(['row-1']);

      expect(innerBus.publish).toHaveBeenCalledTimes(1);
      expect(repo.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE "shared"."outbox"'),
        ['row-1'],
      );
    });

    it('does nothing for a row that is already published or missing', async () => {
      repo.query.mockResolvedValueOnce([]);
      const service = new OutboxRelayService(repo, innerBus, config);

      await service.relay(['row-1']);

      expect(innerBus.publish).not.toHaveBeenCalled();
    });

    it('swallows a publish failure — relay() never throws', async () => {
      repo.query.mockResolvedValueOnce([{ id: 'row-1', payload: { eventName: 'X' } }]);
      innerBus.publish.mockRejectedValue(new Error('pubsub down'));
      const service = new OutboxRelayService(repo, innerBus, config);

      await expect(service.relay(['row-1'])).resolves.toBeUndefined();
    });

    it('processes multiple row ids independently', async () => {
      repo.query
        .mockResolvedValueOnce([{ id: 'row-1', payload: { eventName: 'X' } }])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([{ id: 'row-2', payload: { eventName: 'Y' } }])
        .mockResolvedValueOnce(undefined);
      const service = new OutboxRelayService(repo, innerBus, config);

      await service.relay(['row-1', 'row-2']);

      expect(innerBus.publish).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for an explicitly empty rowIds array — never falls through to sweep+GC', async () => {
      const service = new OutboxRelayService(repo, innerBus, config);

      await service.relay([]);

      expect(repo.query).not.toHaveBeenCalled();
      expect(repo.manager.transaction).not.toHaveBeenCalled();
      expect(innerBus.publish).not.toHaveBeenCalled();
    });
  });

  describe('relay() — sweep + GC path (no rowIds)', () => {
    it('runs the sweep inside a transaction, stops once a batch is empty, then runs retention GC', async () => {
      const manager = { query: jest.fn().mockResolvedValue([]) };
      (repo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: (m: unknown) => Promise<boolean>) => cb(manager),
      );
      const service = new OutboxRelayService(repo, innerBus, config);

      await service.relay();

      expect(repo.manager.transaction).toHaveBeenCalledTimes(1);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        expect.any(Array),
      );
      expect(repo.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "shared"."outbox"'),
        expect.any(Array),
      );
    });

    it('loops again when a batch comes back full (more rows may remain)', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'row-1', payload: { eventName: 'X' } }]) // full "batch" of size 1 == batchSize below
          .mockResolvedValueOnce(undefined) // mark published
          .mockResolvedValueOnce([]), // second iteration: empty, stop
      };
      (repo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: (m: unknown) => Promise<boolean>) => cb(manager),
      );
      const configWithBatchSizeOne = makeConfigService({ OUTBOX_SWEEP_BATCH_SIZE: 1 });
      const service = new OutboxRelayService(repo, innerBus, configWithBatchSizeOne);

      await service.relay();

      expect(repo.manager.transaction).toHaveBeenCalledTimes(2);
    });

    it('a per-row publish failure during the sweep does not stop the rest of the batch', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'row-1', payload: { eventName: 'X' } },
            { id: 'row-2', payload: { eventName: 'Y' } },
          ])
          .mockResolvedValueOnce(undefined), // mark row-2 published (row-1's mark is skipped by the throw)
      };
      (repo.manager.transaction as jest.Mock).mockImplementation(
        async (cb: (m: unknown) => Promise<boolean>) => cb(manager),
      );
      innerBus.publish.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(undefined);
      const service = new OutboxRelayService(repo, innerBus, config);

      await expect(service.relay()).resolves.toBeUndefined();

      expect(innerBus.publish).toHaveBeenCalledTimes(2);
    });
  });
});
