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

  describe('findUnpublishedById()', () => {
    it('returns the row when found', async () => {
      mockRepo.query.mockResolvedValue([{ id: 'row-1', payload: { eventName: 'X' } }]);

      const row = await repo.findUnpublishedById('row-1');

      expect(row).toEqual({ id: 'row-1', payload: { eventName: 'X' } });
    });

    it('returns null when not found (already published or missing)', async () => {
      mockRepo.query.mockResolvedValue([]);

      expect(await repo.findUnpublishedById('row-1')).toBeNull();
    });
  });

  describe('markPublished()', () => {
    it('runs via repo.manager when no explicit manager is passed', async () => {
      await repo.markPublished('row-1');

      expect(mockRepo.manager.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "shared"."outbox"'),
        ['row-1'],
      );
    });

    it('runs via the given manager when one is passed (same transaction as the caller)', async () => {
      const explicitManager = { query: jest.fn() } as unknown as jest.Mocked<EntityManager>;

      await repo.markPublished('row-1', explicitManager);

      expect(explicitManager.query).toHaveBeenCalledWith(expect.any(String), ['row-1']);
      expect(mockRepo.manager.query).not.toHaveBeenCalled();
    });
  });

  describe('claimUnpublished()', () => {
    it('queries with FOR UPDATE SKIP LOCKED using the given manager', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([{ id: 'row-1', payload: { eventName: 'X' } }]),
      } as unknown as jest.Mocked<EntityManager>;

      const rows = await repo.claimUnpublished(manager, 30, 100);

      expect(rows).toEqual([{ id: 'row-1', payload: { eventName: 'X' } }]);
      expect(manager.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE SKIP LOCKED'),
        [30, 100],
      );
    });
  });

  describe('runInTransaction()', () => {
    it('delegates to repo.manager.transaction', async () => {
      const work = jest.fn().mockResolvedValue('result');
      (mockRepo.manager.transaction as jest.Mock).mockImplementation((cb) => cb('fake-manager'));

      const result = await repo.runInTransaction(work);

      expect(result).toBe('result');
      expect(work).toHaveBeenCalledWith('fake-manager');
    });
  });

  describe('deleteOldPublished()', () => {
    it('runs the batched retention delete and returns the number of rows deleted', async () => {
      mockRepo.query.mockResolvedValue([{ id: 'row-1' }, { id: 'row-2' }]);

      const deleted = await repo.deleteOldPublished(14, 100);

      expect(deleted).toBe(2);
      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "shared"."outbox"'),
        [14, 100],
      );
    });

    it('returns 0 when nothing was deleted', async () => {
      mockRepo.query.mockResolvedValue([]);

      expect(await repo.deleteOldPublished(14, 100)).toBe(0);
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
