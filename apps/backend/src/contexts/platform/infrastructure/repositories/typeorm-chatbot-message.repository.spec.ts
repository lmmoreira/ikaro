import { Decimal } from 'decimal.js';
import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ChatbotMessageBuilder,
  ChatbotMessageEntityBuilder,
} from '../../../../test/builders/platform';
import { ChatbotMessage } from '../../domain/chatbot-message.aggregate';
import { ChatbotMessageEntity } from '../entities/chatbot-message.entity';
import { TypeOrmChatbotMessageRepository } from './typeorm-chatbot-message.repository';

const ENTITY = (): ChatbotMessageEntity =>
  new ChatbotMessageEntityBuilder()
    .withId('message-id-1')
    .withSessionId('session-id-1')
    .withTenantId('tenant-id-1')
    .withCostUsd('0.00001234')
    .build();

// Chainable delete-query-builder fake — each method returns the same object except the
// terminal execute() call, matching TypeORM's own fluent DeleteQueryBuilder API surface.
function makeDeleteQueryBuilder(affected: number): {
  delete: jest.Mock;
  from: jest.Mock;
  where: jest.Mock;
  execute: jest.Mock;
} {
  const qb = {
    delete: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  qb.delete.mockReturnValue(qb);
  qb.from.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  return qb;
}

describe('TypeOrmChatbotMessageRepository', () => {
  let mockRepo: jest.Mocked<Repository<ChatbotMessageEntity>>;
  let repo: TypeOrmChatbotMessageRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      manager: { createQueryBuilder: jest.fn() },
    } as unknown as jest.Mocked<Repository<ChatbotMessageEntity>>;
    repo = new TypeOrmChatbotMessageRepository(mockRepo);
  });

  describe('findById', () => {
    it('returns a ChatbotMessage aggregate when found', async () => {
      mockRepo.findOne.mockResolvedValue(ENTITY());

      const result = await repo.findById('message-id-1', 'tenant-id-1');

      expect(result).toBeInstanceOf(ChatbotMessage);
      expect(result!.id).toBe('message-id-1');
      expect(result!.sessionId).toBe('session-id-1');
      expect(result!.role).toBe('USER');
      expect(result!.costUsd).toEqual(new Decimal('0.00001234'));
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'message-id-1', tenantId: 'tenant-id-1' },
      });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findById('unknown', 'tenant-id-1')).toBeNull();
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity and persists via repo when no transaction is active', async () => {
      const message = new ChatbotMessageBuilder()
        .withTenantId('tenant-id-1')
        .withRole('ASSISTANT')
        .withOutputTokens(35)
        .withCostUsd('0.00005678')
        .build();
      mockRepo.save.mockResolvedValue({} as ChatbotMessageEntity);

      await repo.save(message);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as ChatbotMessageEntity;
      expect(savedEntity.id).toBe(message.id);
      expect(savedEntity.tenantId).toBe('tenant-id-1');
      expect(savedEntity.role).toBe('ASSISTANT');
      expect(savedEntity.outputTokens).toBe(35);
      expect(savedEntity.costUsd).toBe('0.00005678');
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = { save: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const message = new ChatbotMessageBuilder().withTenantId('tenant-id-1').build();

      await runWithEntityManager(mockManager, () => repo.save(message));

      expect(mockManager.save).toHaveBeenCalledWith(
        ChatbotMessageEntity,
        expect.objectContaining({ id: message.id, tenantId: 'tenant-id-1' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('deleteOlderThan', () => {
    const cutoff = new Date('2026-02-14T00:00:00.000Z');

    it('deletes via repo.manager.createQueryBuilder() when no transaction is active', async () => {
      const qb = makeDeleteQueryBuilder(3);
      (mockRepo.manager.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      const result = await repo.deleteOlderThan(cutoff);

      expect(qb.from).toHaveBeenCalledWith(ChatbotMessageEntity);
      expect(qb.where).toHaveBeenCalledWith('created_at < :cutoff', { cutoff });
      expect(result).toBe(3);
    });

    it('returns 0 when execute() reports no affected rows', async () => {
      const qb = makeDeleteQueryBuilder(0);
      qb.execute.mockResolvedValue({ affected: null });
      (mockRepo.manager.createQueryBuilder as jest.Mock).mockReturnValue(qb);

      expect(await repo.deleteOlderThan(cutoff)).toBe(0);
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const qb = makeDeleteQueryBuilder(5);
      const mockManager = {
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as unknown as EntityManager;

      const result = await runWithEntityManager(mockManager, () => repo.deleteOlderThan(cutoff));

      expect(mockManager.createQueryBuilder).toHaveBeenCalled();
      expect(mockRepo.manager.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toBe(5);
    });
  });
});
