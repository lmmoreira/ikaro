import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { fakeConfig } from '../../../../test/utils/fake-config';
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
} from '../../domain/errors/chatbot-domain.error';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { ChatCompletionRequest, ILlmProvider } from '../ports/llm-provider.port';
import { LlmProviderRegistry } from '../services/llm-provider-registry.service';
import { SendChatMessageUseCaseInput } from './send-chat-message.types';
import { ChatbotConfigResolver } from '../services/chatbot-config-resolver.service';
import { SendChatMessageUseCase } from './send-chat-message.use-case';

// Never a real network call — the LLM adapter itself is stubbed via FakeLlmProviderBuilder, same
// as every unit test; only the Postgres cap-enforcement path is genuinely exercised here.
describe('SendChatMessageUseCase (integration — real Postgres cap enforcement)', () => {
  let dataSource: DataSource;
  let useCase: SendChatMessageUseCase;
  let tenantRepo: TypeOrmTenantRepository;
  let accessPort: InMemoryTenantAccessPort;
  let llmProvider: ILlmProvider & { requests: ChatCompletionRequest[] };

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
    const fakeProvider = new FakeLlmProviderBuilder().build();
    // Records every request, so a test can see which model and ceiling a tenant's call carried.
    llmProvider = {
      requests: [],
      complete: async (request) => {
        llmProvider.requests.push(request);
        return fakeProvider.complete(request);
      },
    };
    accessPort = new InMemoryTenantAccessPort();
    const registry = new LlmProviderRegistry(
      false,
      llmProvider,
      llmProvider,
      llmProvider,
      llmProvider,
    );
    useCase = new SendChatMessageUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      new TypeOrmTransactionManager(dataSource),
      fakeConfig(),
      new ChatbotConfigResolver(accessPort),
    );
  });

  beforeEach(() => {
    llmProvider.requests.length = 0;
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

  describe('tier-resolved configuration (M26-S21)', () => {
    function seedChatbotTier(tenantId: string, tier: 'BASIC' | 'PLUS'): void {
      accessPort.seed(tenantId, {
        status: 'ACTIVE',
        suspensionReason: null,
        operational: true,
        features: [{ key: 'CHATBOT', tier }],
      });
    }

    it('takes a tier change on the next message, with the ceiling only on BASIC', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-integration-tier-change').build();
      await tenantRepo.save(tenant);
      seedChatbotTier(tenant.id, 'BASIC');
      const first = await useCase.execute(baseInput(tenant.id));

      seedChatbotTier(tenant.id, 'PLUS');
      await useCase.execute(baseInput(tenant.id, { sessionId: first.sessionId }));

      expect(llmProvider.requests.map((r) => r.model)).toEqual([
        'deepseek/deepseek-v4-flash-0731',
        'anthropic/claude-haiku-5.5',
      ]);
      expect(llmProvider.requests[0].maxPrice).toEqual({ prompt: 0.15, completion: 0.5 });
      expect(llmProvider.requests[1].maxPrice).toBeUndefined();
    });

    it('lets a stored tenant override win over the tier', async () => {
      const tenant = new TenantBuilder().withSlug('lavacar-integration-override-wins').build();
      await tenantRepo.save(tenant);
      seedChatbotTier(tenant.id, 'BASIC');

      await useCase.execute(
        baseInput(tenant.id, { chatbotSettings: { llmModel: 'x/operator-test' } }),
      );

      expect(llmProvider.requests[0].model).toBe('x/operator-test');
      expect(llmProvider.requests[0].maxPrice).toBeUndefined();
    });

    it("never lets one tenant's tier or caps change another's", async () => {
      const tenantA = new TenantBuilder().withSlug('lavacar-integration-tier-iso-a').build();
      const tenantB = new TenantBuilder().withSlug('lavacar-integration-tier-iso-b').build();
      await tenantRepo.save(tenantA);
      await tenantRepo.save(tenantB);
      seedChatbotTier(tenantA.id, 'PLUS');
      seedChatbotTier(tenantB.id, 'BASIC');

      await useCase.execute(
        baseInput(tenantA.id, { chatbotSettings: { maxConversationsPerDay: 1 } }),
      );
      await expect(
        useCase.execute(
          baseInput(tenantA.id, {
            chatbotSettings: { maxConversationsPerDay: 1 },
            clientIp: '203.0.113.30',
          }),
        ),
      ).rejects.toThrow(ChatbotDailyCapReachedError);
      const resultB = await useCase.execute(baseInput(tenantB.id, { clientIp: '203.0.113.31' }));

      expect(resultB.sessionId).toBeTruthy();
      expect(llmProvider.requests.map((r) => r.model)).toEqual([
        'anthropic/claude-haiku-5.5',
        'deepseek/deepseek-v4-flash-0731',
      ]);
    });
  });
});
