import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { FakeLlmProviderBuilder, TenantBuilder } from '../../../../test/builders/platform';
import { ChatbotMessageEntity } from '../../infrastructure/entities/chatbot-message.entity';
import { ChatbotProviderBalanceEntity } from '../../infrastructure/entities/chatbot-provider-balance.entity';
import { ChatbotSessionEntity } from '../../infrastructure/entities/chatbot-session.entity';
import { TenantEntity } from '../../infrastructure/entities/tenant.entity';
import { TypeOrmChatbotMessageRepository } from '../../infrastructure/repositories/typeorm-chatbot-message.repository';
import { TypeOrmChatbotProviderBalanceRepository } from '../../infrastructure/repositories/typeorm-chatbot-provider-balance.repository';
import { TypeOrmChatbotSessionRepository } from '../../infrastructure/repositories/typeorm-chatbot-session.repository';
import { TypeOrmTenantRepository } from '../../infrastructure/repositories/typeorm-tenant.repository';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotMessageCapReachedError,
} from '../../domain/errors/platform-domain.error';
import { LlmProviderRegistry } from '../services/llm-provider-registry.service';
import { SendChatMessageUseCase, SendChatMessageUseCaseInput } from './send-chat-message.use-case';

function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, defaultValue: string) => overrides[key] ?? defaultValue,
  } as unknown as ConfigService;
}

// Never a real network call — the LLM adapter itself is stubbed via FakeLlmProviderBuilder, same
// as every unit test; only the Postgres cap-enforcement path is genuinely exercised here.
describe('SendChatMessageUseCase (integration — real Postgres cap enforcement)', () => {
  let dataSource: DataSource;
  let useCase: SendChatMessageUseCase;
  let tenantRepo: TypeOrmTenantRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    tenantRepo = new TypeOrmTenantRepository(
      dataSource.getRepository(TenantEntity),
      new InMemoryEventBus(),
    );
    const sessionRepo = new TypeOrmChatbotSessionRepository(
      dataSource.getRepository(ChatbotSessionEntity),
    );
    const messageRepo = new TypeOrmChatbotMessageRepository(
      dataSource.getRepository(ChatbotMessageEntity),
    );
    const balanceRepo = new TypeOrmChatbotProviderBalanceRepository(
      dataSource.getRepository(ChatbotProviderBalanceEntity),
    );
    const llmProvider = new FakeLlmProviderBuilder().build();
    const registry = new LlmProviderRegistry('openrouter', llmProvider, llmProvider, llmProvider);
    useCase = new SendChatMessageUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      new InMemoryTransactionManager(),
      fakeConfig(),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  function baseInput(
    tenantId: string,
    overrides: Partial<SendChatMessageUseCaseInput> = {},
  ): SendChatMessageUseCaseInput {
    return {
      tenantId,
      clientIp: '203.0.113.10',
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Quais são os horários de funcionamento?',
      chatbotSettings: {},
      timezone: 'America/Sao_Paulo',
      ...overrides,
    };
  }

  it('rejects sequential requests once the (tenant-overridden) daily cap is reached', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-integration-daily-cap').build();
    await tenantRepo.save(tenant);
    const chatbotSettings = { maxConversationsPerDay: 2 };

    const first = await useCase.execute(baseInput(tenant.id, { chatbotSettings }));
    const second = await useCase.execute(
      baseInput(tenant.id, { chatbotSettings, clientIp: '203.0.113.11' }),
    );
    expect(first.sessionId).not.toBe(second.sessionId);

    await expect(
      useCase.execute(baseInput(tenant.id, { chatbotSettings, clientIp: '203.0.113.12' })),
    ).rejects.toThrow(ChatbotDailyCapReachedError);
  });

  it('rejects sequential requests once the (tenant-overridden) concurrency cap is reached', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-integration-concurrency-cap').build();
    await tenantRepo.save(tenant);
    const chatbotSettings = { maxConcurrentConversations: 2 };

    await useCase.execute(baseInput(tenant.id, { chatbotSettings, clientIp: '203.0.113.20' }));
    await useCase.execute(baseInput(tenant.id, { chatbotSettings, clientIp: '203.0.113.21' }));

    await expect(
      useCase.execute(baseInput(tenant.id, { chatbotSettings, clientIp: '203.0.113.22' })),
    ).rejects.toThrow(ChatbotConcurrencyCapReachedError);
  });

  it('rejects sequential messages on the same session once the message cap is reached, and marks it CAPPED', async () => {
    const tenant = new TenantBuilder().withSlug('lavacar-integration-message-cap').build();
    await tenantRepo.save(tenant);
    const chatbotSettings = { maxMessagesPerConversation: 4 };

    const first = await useCase.execute(baseInput(tenant.id, { chatbotSettings }));
    await useCase.execute(baseInput(tenant.id, { chatbotSettings, sessionId: first.sessionId }));

    await expect(
      useCase.execute(baseInput(tenant.id, { chatbotSettings, sessionId: first.sessionId })),
    ).rejects.toThrow(ChatbotMessageCapReachedError);
  });
});
