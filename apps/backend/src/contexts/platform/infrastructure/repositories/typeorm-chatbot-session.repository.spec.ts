import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ChatbotSessionBuilder,
  ChatbotSessionEntityBuilder,
} from '../../../../test/builders/platform';
import { ChatbotSession } from '../../domain/chatbot-session.aggregate';
import { ChatbotSessionEntity } from '../entities/chatbot-session.entity';
import { TypeOrmChatbotSessionRepository } from './typeorm-chatbot-session.repository';

const ENTITY = (): ChatbotSessionEntity =>
  new ChatbotSessionEntityBuilder().withId('session-id-1').withTenantId('tenant-id-1').build();

describe('TypeOrmChatbotSessionRepository', () => {
  let mockRepo: jest.Mocked<Repository<ChatbotSessionEntity>>;
  let repo: TypeOrmChatbotSessionRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<ChatbotSessionEntity>>;
    repo = new TypeOrmChatbotSessionRepository(mockRepo);
  });

  describe('findById', () => {
    it('returns a ChatbotSession aggregate when found', async () => {
      mockRepo.findOne.mockResolvedValue(ENTITY());

      const result = await repo.findById('session-id-1', 'tenant-id-1');

      expect(result).toBeInstanceOf(ChatbotSession);
      expect(result!.id).toBe('session-id-1');
      expect(result!.tenantId).toBe('tenant-id-1');
      expect(result!.status).toBe('ACTIVE');
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'session-id-1', tenantId: 'tenant-id-1' },
      });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findById('unknown', 'tenant-id-1')).toBeNull();
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity and persists via repo when no transaction is active', async () => {
      const session = new ChatbotSessionBuilder().withTenantId('tenant-id-1').build();
      mockRepo.save.mockResolvedValue({} as ChatbotSessionEntity);

      await repo.save(session);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as ChatbotSessionEntity;
      expect(savedEntity.id).toBe(session.id);
      expect(savedEntity.tenantId).toBe('tenant-id-1');
      expect(savedEntity.status).toBe('ACTIVE');
      expect(savedEntity.messageCount).toBe(0);
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = { save: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const session = new ChatbotSessionBuilder().withTenantId('tenant-id-1').build();

      await runWithEntityManager(mockManager, () => repo.save(session));

      expect(mockManager.save).toHaveBeenCalledWith(
        ChatbotSessionEntity,
        expect.objectContaining({ id: session.id, tenantId: 'tenant-id-1' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('persists state transitions (recordMessage/markCapped)', async () => {
      const session = new ChatbotSessionBuilder().withTenantId('tenant-id-1').build();
      session.recordMessage();
      session.markCapped();
      mockRepo.save.mockResolvedValue({} as ChatbotSessionEntity);

      await repo.save(session);

      const savedEntity = mockRepo.save.mock.calls[0][0] as ChatbotSessionEntity;
      expect(savedEntity.messageCount).toBe(1);
      expect(savedEntity.status).toBe('CAPPED');
    });
  });
});
