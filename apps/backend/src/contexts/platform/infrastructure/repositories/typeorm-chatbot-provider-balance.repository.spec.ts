import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ChatbotProviderBalanceBuilder } from '../../../../test/builders/platform';
import { ChatbotProviderBalance } from '../../domain/chatbot-provider-balance.aggregate';
import { ChatbotProviderBalanceEntity } from '../entities/chatbot-provider-balance.entity';
import { TypeOrmChatbotProviderBalanceRepository } from './typeorm-chatbot-provider-balance.repository';

const ENTITY = (): ChatbotProviderBalanceEntity => {
  const entity = new ChatbotProviderBalanceEntity();
  entity.provider = 'openrouter';
  entity.remainingUsd = '18.4200';
  entity.checkedAt = new Date('2026-08-09T10:00:00Z');
  return entity;
};

describe('TypeOrmChatbotProviderBalanceRepository', () => {
  let mockRepo: jest.Mocked<Repository<ChatbotProviderBalanceEntity>>;
  let repo: TypeOrmChatbotProviderBalanceRepository;

  beforeEach(() => {
    mockRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<ChatbotProviderBalanceEntity>>;
    repo = new TypeOrmChatbotProviderBalanceRepository(mockRepo);
  });

  describe('findByProvider', () => {
    it('returns a ChatbotProviderBalance aggregate when found, converting the numeric string', async () => {
      mockRepo.findOne.mockResolvedValue(ENTITY());

      const result = await repo.findByProvider('openrouter');

      expect(result).toBeInstanceOf(ChatbotProviderBalance);
      expect(result!.provider).toBe('openrouter');
      expect(result!.remainingUsd).toBe(18.42);
      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { provider: 'openrouter' } });
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      expect(await repo.findByProvider('unknown')).toBeNull();
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity and persists via repo when no transaction is active', async () => {
      const balance = new ChatbotProviderBalanceBuilder()
        .withProvider('openrouter')
        .withRemainingUsd(18.42)
        .build();
      mockRepo.save.mockResolvedValue({} as ChatbotProviderBalanceEntity);

      await repo.save(balance);

      expect(mockRepo.save).toHaveBeenCalledTimes(1);
      const savedEntity = mockRepo.save.mock.calls[0][0] as ChatbotProviderBalanceEntity;
      expect(savedEntity.provider).toBe('openrouter');
      expect(savedEntity.remainingUsd).toBe('18.4200');
    });

    it('uses the active EntityManager when inside a transaction', async () => {
      const mockManager = { save: jest.fn().mockResolvedValue({}) } as unknown as EntityManager;
      const balance = new ChatbotProviderBalanceBuilder().withProvider('openrouter').build();

      await runWithEntityManager(mockManager, () => repo.save(balance));

      expect(mockManager.save).toHaveBeenCalledWith(
        ChatbotProviderBalanceEntity,
        expect.objectContaining({ provider: 'openrouter' }),
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });
  });
});
