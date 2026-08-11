import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../transaction-context';
import { StubCommand, StubEvent } from '../../../test/infrastructure/stub-envelope-classes';
import { OutboxEventEntity } from './outbox-event.entity';
import { OutboxPublishedOutsideTransactionError } from './outbox-published-outside-transaction.error';
import { TypeOrmOutboxRepository } from './typeorm-outbox.repository';

describe('TypeOrmOutboxRepository', () => {
  let mockRepo: jest.Mocked<Repository<OutboxEventEntity>>;
  let repo: TypeOrmOutboxRepository;

  beforeEach(() => {
    mockRepo = {
      query: jest.fn(),
      manager: { transaction: jest.fn(), query: jest.fn() },
    } as unknown as jest.Mocked<Repository<OutboxEventEntity>>;
    repo = new TypeOrmOutboxRepository(mockRepo);
  });

  describe('insert()', () => {
    it('throws OutboxPublishedOutsideTransactionError when no transaction is ambient (TD24-S03)', async () => {
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      await expect(repo.insert(event, event.eventId)).rejects.toThrow(
        OutboxPublishedOutsideTransactionError,
      );
      expect(mockRepo.query).not.toHaveBeenCalled();
    });

    it('joins the ambient transaction manager when one is active', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([{ id: 'row-1' }]),
      } as unknown as jest.Mocked<EntityManager>;
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      const id = await runWithEntityManager(mockManager, () => repo.insert(event, event.eventId));

      expect(id).toBe('row-1');
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "shared"."outbox"'),
        [event.eventId, event.eventId, 'tenant-1', 'StubEvent', JSON.stringify(event)],
      );
    });

    it('returns undefined on a dedup_key conflict (no row returned)', async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<EntityManager>;
      const event = new StubEvent('tenant-1', 'corr-1', { value: 'x' });

      const id = await runWithEntityManager(mockManager, () => repo.insert(event, event.eventId));

      expect(id).toBeUndefined();
    });

    it("persists the given dedupKey verbatim for a Command event (derivation is OutboxPublisher.publish()'s job, not this repository's)", async () => {
      const mockManager = {
        query: jest.fn().mockResolvedValue([{ id: 'row-1' }]),
      } as unknown as jest.Mocked<EntityManager>;

      const command = new StubCommand('tenant-1', 'corr-1', { value: 'x' }, 'business-key-1');

      await runWithEntityManager(mockManager, () => repo.insert(command, command.dedupKey));

      expect(mockManager.query).toHaveBeenCalledWith(expect.any(String), [
        command.eventId,
        command.dedupKey,
        'tenant-1',
        'StubCommand',
        JSON.stringify(command),
      ]);
    });
  });

  describe('claimUnpublishedById()', () => {
    it('requires the ambient transaction and returns its atomic claim', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValue([{ id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' }]),
      } as unknown as jest.Mocked<EntityManager>;

      const row = await runWithEntityManager(manager, () =>
        repo.claimUnpublishedById('row-1', 'lease-1', 120),
      );

      expect(row).toEqual({ id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' });
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "shared"."outbox"'),
        ['row-1', 'lease-1', 120],
      );
    });

    it('throws when no transaction is ambient', async () => {
      await expect(repo.claimUnpublishedById('row-1', 'lease-1', 120)).rejects.toThrow(
        'Outbox inline claims must run inside ITransactionManager.run()',
      );
    });

    it('normalizes TypeORM’s transactional [rows, rowCount] result shape', async () => {
      const claimedRow = { id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' };
      const manager = {
        query: jest.fn().mockResolvedValue([[claimedRow], 1]),
      } as unknown as jest.Mocked<EntityManager>;

      await expect(
        runWithEntityManager(manager, () => repo.claimUnpublishedById('row-1', 'lease-1', 120)),
      ).resolves.toEqual(claimedRow);
    });
  });

  describe('markPublished()', () => {
    it('runs via repo.manager', async () => {
      await repo.markPublished('row-1');

      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "shared"."outbox"'),
        ['row-1', null],
      );
    });

    it('joins the ambient transaction and conditionally marks its lease', async () => {
      const manager = { query: jest.fn() } as unknown as jest.Mocked<EntityManager>;

      await runWithEntityManager(manager, () => repo.markPublished('row-1', 'lease-1'));

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('"lease_token" = $2::uuid'),
        ['row-1', 'lease-1'],
      );
    });
  });

  describe('claimUnpublished()', () => {
    it('requires and joins the ambient transaction manager', async () => {
      const manager = {
        query: jest
          .fn()
          .mockResolvedValue([{ id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' }]),
      } as unknown as jest.Mocked<EntityManager>;

      const rows = await runWithEntityManager(manager, () =>
        repo.claimUnpublished(30, 100, 'lease-1', 120),
      );

      expect(rows).toEqual([{ id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' }]);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [30, 100, 'lease-1', 120],
      );
    });

    it('normalizes TypeORM’s transactional [rows, rowCount] result shape', async () => {
      const claimedRows = [{ id: 'row-1', payload: { eventName: 'X' }, leaseToken: 'lease-1' }];
      const manager = {
        query: jest.fn().mockResolvedValue([claimedRows, 1]),
      } as unknown as jest.Mocked<EntityManager>;

      await expect(
        runWithEntityManager(manager, () => repo.claimUnpublished(30, 100, 'lease-1', 120)),
      ).resolves.toEqual(claimedRows);
    });

    it('throws when no transaction is ambient', async () => {
      await expect(repo.claimUnpublished(30, 100, 'lease-1', 120)).rejects.toThrow(
        'Outbox claims must run inside ITransactionManager.run()',
      );
    });
  });

  describe('releaseClaim()', () => {
    it('joins the ambient transaction and clears only its lease', async () => {
      const manager = { query: jest.fn() } as unknown as jest.Mocked<EntityManager>;

      await runWithEntityManager(manager, () => repo.releaseClaim('row-1', 'lease-1'));

      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('"lease_token" = $2::uuid'),
        ['row-1', 'lease-1'],
      );
    });
  });

  describe('deleteOldPublished()', () => {
    it('runs the batched retention delete and returns the number of rows deleted', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]),
      } as unknown as jest.Mocked<EntityManager>;

      const deleted = await runWithEntityManager(manager, () => repo.deleteOldPublished(14, 100));

      expect(deleted).toBe(2);
      const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]];
      // Asserts the RETURNING clause is actually present — without it, `deleted` above would be
      // wrong in production even though this mock (which returns canned rows regardless of the
      // SQL sent) would still pass.
      expect(sql).toContain('DELETE FROM "shared"."outbox"');
      expect(sql).toContain('RETURNING "id"');
      expect(params).toEqual([14, 100]);
    });

    it('returns 0 when nothing was deleted', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([]),
      } as unknown as jest.Mocked<EntityManager>;

      await expect(repo.deleteOldPublished(14, 100)).rejects.toThrow(
        'Outbox retention GC must run inside ITransactionManager.run()',
      );
      await expect(
        runWithEntityManager(manager, () => repo.deleteOldPublished(14, 100)),
      ).resolves.toBe(0);
    });
  });

  describe('countUnpublished()', () => {
    it('returns the unpublished count and oldest-age from the query result', async () => {
      mockRepo.query.mockResolvedValue([{ count: 3, oldestAgeSeconds: 120 }]);

      const backlog = await repo.countUnpublished();

      expect(backlog).toEqual({ count: 3, oldestAgeSeconds: 120 });
      expect(mockRepo.query).toHaveBeenCalledWith(expect.stringContaining('COUNT(*)'));
    });

    it('falls back to a zero/null backlog when the query returns no row', async () => {
      mockRepo.query.mockResolvedValue([]);

      expect(await repo.countUnpublished()).toEqual({ count: 0, oldestAgeSeconds: null });
    });
  });
});
