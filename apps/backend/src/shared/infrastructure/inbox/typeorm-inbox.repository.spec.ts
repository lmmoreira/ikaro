import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../transaction-context';
import { InboxRecordEntity } from './inbox-record.entity';
import { TypeOrmInboxRepository } from './typeorm-inbox.repository';

describe('TypeOrmInboxRepository', () => {
  let mockRepo: jest.Mocked<Repository<InboxRecordEntity>>;
  let repo: TypeOrmInboxRepository;

  beforeEach(() => {
    mockRepo = {
      count: jest.fn(),
      upsert: jest.fn(),
      query: jest.fn(),
    } as unknown as jest.Mocked<Repository<InboxRecordEntity>>;
    repo = new TypeOrmInboxRepository(mockRepo);
  });

  describe('hasBeenProcessed()', () => {
    it('returns true when a matching row exists', async () => {
      mockRepo.count.mockResolvedValue(1);

      expect(await repo.hasBeenProcessed('event-1', 'consumer-a')).toBe(true);
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { eventId: 'event-1', consumerName: 'consumer-a' },
      });
    });

    it('returns false when no matching row exists', async () => {
      mockRepo.count.mockResolvedValue(0);

      expect(await repo.hasBeenProcessed('event-1', 'consumer-a')).toBe(false);
    });
  });

  describe('markProcessed()', () => {
    it('upserts via the ambient transaction manager when one is active', async () => {
      const mockManager = {
        upsert: jest.fn().mockResolvedValue(undefined),
      } as unknown as jest.Mocked<EntityManager>;

      await runWithEntityManager(mockManager, () => repo.markProcessed('event-1', 'consumer-a'));

      expect(mockManager.upsert).toHaveBeenCalledWith(
        InboxRecordEntity,
        expect.objectContaining({ eventId: 'event-1', consumerName: 'consumer-a' }),
        ['eventId', 'consumerName'],
      );
      expect(mockRepo.upsert).not.toHaveBeenCalled();
    });

    it('falls back to the standalone repository when no transaction is ambient', async () => {
      await repo.markProcessed('event-1', 'consumer-a');

      expect(mockRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'event-1', consumerName: 'consumer-a' }),
        ['eventId', 'consumerName'],
      );
    });
  });

  describe('tryClaim()', () => {
    it('returns true when the insert wins (no prior claim)', async () => {
      mockRepo.query.mockResolvedValue([{ event_id: 'event-1' }]);

      expect(await repo.tryClaim('event-1', 'consumer-a')).toBe(true);
      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "shared"."inbox"'),
        ['event-1', 'consumer-a'],
      );
    });

    it('returns false when the pair is already claimed (ON CONFLICT DO NOTHING, no row returned)', async () => {
      mockRepo.query.mockResolvedValue([]);

      expect(await repo.tryClaim('event-1', 'consumer-a')).toBe(false);
    });
  });

  describe('unclaim()', () => {
    it('deletes the row for the given (eventId, consumerName) pair', async () => {
      await repo.unclaim('event-1', 'consumer-a');

      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "shared"."inbox" WHERE "event_id" = $1'),
        ['event-1', 'consumer-a'],
      );
    });
  });

  describe('deleteOldProcessed()', () => {
    it('runs the batched retention delete and returns the number of rows deleted', async () => {
      mockRepo.query.mockResolvedValue([{ event_id: 'event-1' }, { event_id: 'event-2' }]);

      const deleted = await repo.deleteOldProcessed(14, 100);

      expect(deleted).toBe(2);
      const [sql, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      // Asserts the RETURNING clause is actually present — without it, `deleted` above would be
      // wrong in production even though this mock (which returns canned rows regardless of the
      // SQL sent) would still pass.
      expect(sql).toContain('DELETE FROM "shared"."inbox"');
      expect(sql).toContain('RETURNING "event_id"');
      expect(params).toEqual([14, 100]);
    });

    it('returns 0 when nothing was deleted', async () => {
      mockRepo.query.mockResolvedValue([]);

      expect(await repo.deleteOldProcessed(14, 100)).toBe(0);
    });
  });
});
