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

  describe('deleteOldProcessed()', () => {
    it('runs the batched retention delete', async () => {
      await repo.deleteOldProcessed(14, 100);

      expect(mockRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM "shared"."inbox"'),
        [14, 100],
      );
    });
  });
});
