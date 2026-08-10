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
    .build();

describe('TypeOrmChatbotMessageRepository', () => {
  let mockRepo: jest.Mocked<Repository<ChatbotMessageEntity>>;
  let repo: TypeOrmChatbotMessageRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
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
        .build();
      mockRepo.save.mockResolvedValue({} as ChatbotMessageEntity);

      await repo.save(message);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as ChatbotMessageEntity;
      expect(savedEntity.id).toBe(message.id);
      expect(savedEntity.tenantId).toBe('tenant-id-1');
      expect(savedEntity.role).toBe('ASSISTANT');
      expect(savedEntity.outputTokens).toBe(35);
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
});
