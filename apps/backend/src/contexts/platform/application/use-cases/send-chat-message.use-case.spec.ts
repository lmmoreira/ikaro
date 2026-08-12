import { ConfigService } from '@nestjs/config';
import { ITracingPort, SpanAttributeValue } from '@ikaro/observability';
import { Decimal } from 'decimal.js';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import {
  ChatbotMessageBuilder,
  ChatbotProviderBalanceBuilder,
  ChatbotSessionBuilder,
  FakeLlmProviderBuilder,
} from '../../../../test/builders/platform';
import {
  InMemoryChatbotMessageRepository,
  InMemoryChatbotProviderBalanceRepository,
  InMemoryChatbotSessionRepository,
} from '../../../../test/repositories/platform';
import { ChatbotSession } from '../../domain/chatbot-session.aggregate';
import { ILlmProvider } from '../ports/llm-provider.port';
import { LlmProviderRegistry } from '../services/llm-provider-registry.service';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotGlobalSpendLimitReachedError,
  ChatbotMessageCapReachedError,
  ChatbotMessageTooLongError,
  ChatbotProviderBalanceLowError,
  ChatbotProviderUnavailableError,
  ChatbotSessionNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { SendChatMessageUseCase, SendChatMessageUseCaseInput } from './send-chat-message.use-case';

class FakeTracingPort implements ITracingPort {
  readonly calls: Array<Record<string, SpanAttributeValue>> = [];
  setActiveSpanAttributes(attributes: Record<string, SpanAttributeValue>): void {
    this.calls.push(attributes);
  }
  getActiveTraceContext(): undefined {
    return undefined;
  }
  injectContext(): void {}
  runWithExtractedContext<T>(_carrier: Record<string, string>, fn: () => T): T {
    return fn();
  }
  startActiveSpan<T>(_name: string, fn: () => T): T {
    return fn();
  }
}

function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, defaultValue: string) => overrides[key] ?? defaultValue,
  } as unknown as ConfigService;
}

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const CLIENT_IP = '203.0.113.10';

describe('SendChatMessageUseCase', () => {
  let sessionRepo: InMemoryChatbotSessionRepository;
  let messageRepo: InMemoryChatbotMessageRepository;
  let balanceRepo: InMemoryChatbotProviderBalanceRepository;
  let tracingPort: FakeTracingPort;
  let llmProvider: ILlmProvider;

  function buildUseCase(config: ConfigService = fakeConfig()): SendChatMessageUseCase {
    llmProvider = new FakeLlmProviderBuilder().build();
    const registry = new LlmProviderRegistry('openrouter', llmProvider, llmProvider, llmProvider);
    return new SendChatMessageUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      new InMemoryTransactionManager(),
      config,
      tracingPort,
    );
  }

  function baseInput(
    overrides: Partial<SendChatMessageUseCaseInput> = {},
  ): SendChatMessageUseCaseInput {
    return {
      tenantId: TENANT_ID,
      clientIp: CLIENT_IP,
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Quais são os horários de funcionamento?',
      chatbotSettings: {},
      timezone: 'America/Sao_Paulo',
      ...overrides,
    };
  }

  beforeEach(() => {
    sessionRepo = new InMemoryChatbotSessionRepository();
    messageRepo = new InMemoryChatbotMessageRepository();
    balanceRepo = new InMemoryChatbotProviderBalanceRepository();
    tracingPort = new FakeTracingPort();
  });

  describe('message length (layer 5)', () => {
    it('throws ChatbotMessageTooLongError once the resolved cap is exceeded, using the tenant override', async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute(
          baseInput({
            userMessage: 'a'.repeat(11),
            chatbotSettings: { maxMessageLengthChars: 10 },
          }),
        ),
      ).rejects.toThrow(ChatbotMessageTooLongError);
    });

    it('allows a message under the default cap when no tenant override is set', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput({ userMessage: 'a'.repeat(999) }));

      expect(result.sessionId).toBeTruthy();
    });

    it('is checked before any repository read — no session/message row is ever touched for a rejected message', async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute(
          baseInput({
            userMessage: 'a'.repeat(11),
            chatbotSettings: { maxMessageLengthChars: 10 },
          }),
        ),
      ).rejects.toThrow(ChatbotMessageTooLongError);

      expect(await sessionRepo.countByTenantAndDate(TENANT_ID, todayInSaoPaulo())).toBe(0);
    });
  });

  describe('new session — volume caps (layers 1-3)', () => {
    it('creates a session and persists both message rows on the happy path', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput());

      expect(result.reply).toBe('Fake LLM response');
      expect(result.sessionId).toBeTruthy();
      const stored = await messageRepo.findBySession(result.sessionId, TENANT_ID);
      expect(stored).toHaveLength(2);
      expect(stored[0].role).toBe('USER');
      expect(stored[0].costUsd.toString()).toBe('0');
      expect(stored[1].role).toBe('ASSISTANT');
      expect(stored[1].costUsd.toString()).toBe('0.00001');
    });

    it('throws ChatbotDailyCapReachedError once the tenant-wide daily cap is reached', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 30; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotDailyCapReachedError);
    });

    it('respects a tenant override of maxConversationsPerDay instead of the default', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 2; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      await expect(
        useCase.execute(baseInput({ chatbotSettings: { maxConversationsPerDay: 2 } })),
      ).rejects.toThrow(ChatbotDailyCapReachedError);
    });

    it('throws ChatbotDailyCapReachedError once the per-IP daily cap is reached, even under the tenant-wide cap', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withClientIp(CLIENT_IP)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotDailyCapReachedError);
    });

    it('does not block a different IP once one IP has hit its own per-IP cap', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        const session = new ChatbotSessionBuilder()
          .withTenantId(TENANT_ID)
          .withClientIp(CLIENT_IP)
          .withConversationDate(todayInSaoPaulo())
          .build();
        // Stale (not concurrency-active) so this test isolates the per-IP cap from layer 3.
        await sessionRepo.save(staleSession(session, TENANT_ID));
      }

      const result = await useCase.execute(baseInput({ clientIp: '198.51.100.20' }));
      expect(result.sessionId).toBeTruthy();
    });

    it('throws ChatbotConcurrencyCapReachedError once the concurrency cap is reached', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        const active = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
        await sessionRepo.save(active);
      }

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotConcurrencyCapReachedError);
    });

    it('does not count a session last active more than 2 minutes ago toward the concurrency cap', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        const stale = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
        // Simulate a session that went quiet: reconstitute with an old lastMessageAt.
        const staleWithOldActivity = staleSession(stale, TENANT_ID);
        await sessionRepo.save(staleWithOldActivity);
      }

      const result = await useCase.execute(baseInput());
      expect(result.sessionId).toBeTruthy();
    });

    it('persists the new session before calling the LLM, not after (PR #360 review — narrows the concurrency-cap race to the LLM call itself, not the full request)', async () => {
      let sessionCountAtLlmCallTime = -1;
      const observingProvider: ILlmProvider = {
        complete: async () => {
          sessionCountAtLlmCallTime = await sessionRepo.countActiveSince(
            TENANT_ID,
            new Date(Date.now() - 2 * 60 * 1000),
          );
          return {
            text: 'ok',
            inputTokens: 1,
            outputTokens: 1,
            modelId: 'fake-model',
            costUsd: new Decimal(0),
          };
        },
      };
      const registry = new LlmProviderRegistry(
        'openrouter',
        observingProvider,
        observingProvider,
        observingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await useCase.execute(baseInput());

      expect(sessionCountAtLlmCallTime).toBe(1);
    });
  });

  describe('existing session — message cap (layer 4) + history truncation (layer 8)', () => {
    it('throws ChatbotSessionNotFoundError for an unknown sessionId', async () => {
      const useCase = buildUseCase();

      await expect(
        useCase.execute(baseInput({ sessionId: '01234567-0000-7000-8000-999999999999' })),
      ).rejects.toThrow(ChatbotSessionNotFoundError);
    });

    it('throws ChatbotSessionNotFoundError when the session belongs to a different tenant', async () => {
      const useCase = buildUseCase();
      const session = new ChatbotSessionBuilder().withTenantId('other-tenant').build();
      await sessionRepo.save(session);

      await expect(useCase.execute(baseInput({ sessionId: session.id }))).rejects.toThrow(
        ChatbotSessionNotFoundError,
      );
    });

    it('throws ChatbotMessageCapReachedError and marks the session CAPPED once the message cap is reached', async () => {
      const useCase = buildUseCase();
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      for (let i = 0; i < 20; i++) session.recordMessage();
      await sessionRepo.save(session);

      await expect(useCase.execute(baseInput({ sessionId: session.id }))).rejects.toThrow(
        ChatbotMessageCapReachedError,
      );

      const reloaded = await sessionRepo.findById(session.id, TENANT_ID);
      expect(reloaded!.status).toBe('CAPPED');
    });

    it('rejects a turn that would push messageCount past the cap, even from an odd-configured value (exact ceiling, PR #360 review)', async () => {
      const useCase = buildUseCase();
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      for (let i = 0; i < 4; i++) session.recordMessage();
      await sessionRepo.save(session);

      // maxMessagesPerConversation=5 (odd): 4 stored + this turn's 2 would reach 6 > 5 — must
      // reject here, not silently allow the conversation to overshoot the configured cap by 1.
      await expect(
        useCase.execute(
          baseInput({ sessionId: session.id, chatbotSettings: { maxMessagesPerConversation: 5 } }),
        ),
      ).rejects.toThrow(ChatbotMessageCapReachedError);
    });

    it('allows a turn that lands exactly on the cap', async () => {
      const useCase = buildUseCase();
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      for (let i = 0; i < 3; i++) session.recordMessage();
      await sessionRepo.save(session);

      // maxMessagesPerConversation=5: 3 stored + this turn's 2 lands exactly on 5 — must pass.
      const result = await useCase.execute(
        baseInput({ sessionId: session.id, chatbotSettings: { maxMessagesPerConversation: 5 } }),
      );

      expect(result.sessionId).toBe(session.id);
    });

    it('sends only the last maxHistoryMessagesSentToLlm messages to the LLM, not the full conversation', async () => {
      const capturingProvider = new CapturingLlmProvider();
      const registry = new LlmProviderRegistry(
        'openrouter',
        capturingProvider,
        capturingProvider,
        capturingProvider,
      );
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      await sessionRepo.save(session);
      for (let i = 0; i < 12; i++) {
        await messageRepo.save(
          new ChatbotMessageBuilder()
            .withTenantId(TENANT_ID)
            .withSessionId(session.id)
            .withContent(`message ${i}`)
            .build(),
        );
      }
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await useCase.execute(
        baseInput({ sessionId: session.id, chatbotSettings: { maxHistoryMessagesSentToLlm: 4 } }),
      );

      expect(capturingProvider.lastRequest?.history).toHaveLength(4);
    });
  });

  describe('platform-wide backstops (layers 9-10)', () => {
    it("throws ChatbotGlobalSpendLimitReachedError once today's spend meets the configured limit", async () => {
      await messageRepo.save(
        new ChatbotMessageBuilder().withTenantId(TENANT_ID).withCostUsd('25').build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD: '25' }));

      await expect(useCase.execute(baseInput())).rejects.toThrow(
        ChatbotGlobalSpendLimitReachedError,
      );
    });

    it('does NOT reject an existing, already-open conversation once the global spend limit trips mid-conversation — docs/discovery/CHATBOT/CHATBOT.md §8.9: "already-open conversations remain bounded by their own per-session caps regardless"', async () => {
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      await sessionRepo.save(session);
      await messageRepo.save(
        new ChatbotMessageBuilder().withTenantId(TENANT_ID).withCostUsd('25').build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD: '25' }));

      const result = await useCase.execute(baseInput({ sessionId: session.id }));

      expect(result.sessionId).toBe(session.id);
    });

    it('does NOT reject an existing, already-open conversation once the provider balance floor trips mid-conversation', async () => {
      const session = new ChatbotSessionBuilder().withTenantId(TENANT_ID).build();
      await sessionRepo.save(session);
      await balanceRepo.save(
        new ChatbotProviderBalanceBuilder().withProvider('openrouter').withRemainingUsd(0).build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      const result = await useCase.execute(baseInput({ sessionId: session.id }));

      expect(result.sessionId).toBe(session.id);
    });

    it('throws ChatbotProviderBalanceLowError once the resolved provider balance is below the minimum', async () => {
      await balanceRepo.save(
        new ChatbotProviderBalanceBuilder().withProvider('openrouter').withRemainingUsd(1).build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotProviderBalanceLowError);
    });

    it('checks the balance of the tenant-overridden provider, not the platform default', async () => {
      await balanceRepo.save(
        new ChatbotProviderBalanceBuilder().withProvider('openrouter').withRemainingUsd(0).build(),
      );
      await balanceRepo.save(
        new ChatbotProviderBalanceBuilder().withProvider('anthropic').withRemainingUsd(50).build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      const result = await useCase.execute(
        baseInput({ chatbotSettings: { llmProvider: 'anthropic' } }),
      );

      expect(result.sessionId).toBeTruthy();
    });

    it('allows the request through when no balance row exists yet (fail-open before the first poll)', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput());

      expect(result.sessionId).toBeTruthy();
    });
  });

  describe('LLM provider resolution', () => {
    it('forwards a tenant llmModel override to the resolved adapter', async () => {
      const capturingProvider = new CapturingLlmProvider();
      const registry = new LlmProviderRegistry(
        'openrouter',
        capturingProvider,
        capturingProvider,
        capturingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await useCase.execute(baseInput({ chatbotSettings: { llmModel: 'deepseek/custom-tier' } }));

      expect(capturingProvider.lastRequest?.model).toBe('deepseek/custom-tier');
    });

    it('passes maxOutputTokensPerResponse as a hard ceiling on the LLM call', async () => {
      const capturingProvider = new CapturingLlmProvider();
      const registry = new LlmProviderRegistry(
        'openrouter',
        capturingProvider,
        capturingProvider,
        capturingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await useCase.execute(baseInput({ chatbotSettings: { maxOutputTokensPerResponse: 123 } }));

      expect(capturingProvider.lastRequest?.maxOutputTokens).toBe(123);
    });

    it('throws ChatbotProviderUnavailableError when the LLM call itself fails', async () => {
      const failingProvider: ILlmProvider = {
        complete: () => Promise.reject(new Error('OpenRouter request failed: 500')),
      };
      const registry = new LlmProviderRegistry(
        'openrouter',
        failingProvider,
        failingProvider,
        failingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotProviderUnavailableError);
    });

    it('never embeds the raw upstream error text in the public-facing error (PR #360 review — info disclosure)', async () => {
      const failingProvider: ILlmProvider = {
        complete: () =>
          Promise.reject(
            new Error('OpenRouter request failed: 500 {"error":"invalid api key sk-abc123"}'),
          ),
      };
      const registry = new LlmProviderRegistry(
        'openrouter',
        failingProvider,
        failingProvider,
        failingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      let caught: unknown;
      try {
        await useCase.execute(baseInput());
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ChatbotProviderUnavailableError);
      expect((caught as Error).message).not.toContain('sk-abc123');
      expect((caught as Error).message).not.toContain('OpenRouter');
    });

    it('logs the real upstream cause server-side when the LLM call fails', async () => {
      let logged: Record<string, unknown> | undefined;
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        const parsed = JSON.parse(chunk as string) as Record<string, unknown>;
        if (parsed['message'] === 'Chatbot LLM provider call failed') logged = parsed;
        return true;
      });
      const failingProvider: ILlmProvider = {
        complete: () => Promise.reject(new Error('upstream cause detail')),
      };
      const registry = new LlmProviderRegistry(
        'openrouter',
        failingProvider,
        failingProvider,
        failingProvider,
      );
      const useCase = new SendChatMessageUseCase(
        sessionRepo,
        messageRepo,
        balanceRepo,
        registry,
        new InMemoryTransactionManager(),
        fakeConfig(),
        tracingPort,
      );

      await expect(useCase.execute(baseInput())).rejects.toThrow(ChatbotProviderUnavailableError);

      expect(logged).toBeDefined();
      writeSpy.mockRestore();
    });
  });

  describe('tracing + structured logging', () => {
    it('sets chatbot.* span attributes on a successful send', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput());

      const finalCall = tracingPort.calls.at(-1)!;
      expect(finalCall['chatbot.session_id']).toBe(result.sessionId);
      expect(finalCall['chatbot.provider']).toBe('openrouter');
      expect(finalCall['chatbot.model_id']).toBeTruthy();
      expect(finalCall['chatbot.input_tokens']).toBe(100);
      expect(finalCall['chatbot.output_tokens']).toBe(20);
    });

    it('sets chatbot.cap_rejected on a cap rejection', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 30; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      await expect(useCase.execute(baseInput())).rejects.toThrow();

      const rejectionCall = tracingPort.calls.find((c) => c['chatbot.cap_rejected']);
      expect(rejectionCall?.['chatbot.cap_rejected']).toBe('daily_cap');
    });

    it('logs a structured warning on cap rejection', async () => {
      let logged: Record<string, unknown> | undefined;
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        const parsed = JSON.parse(chunk as string) as Record<string, unknown>;
        if (parsed['message'] === 'Chatbot cap rejected request') logged = parsed;
        return true;
      });
      const useCase = buildUseCase();
      for (let i = 0; i < 30; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      await expect(useCase.execute(baseInput())).rejects.toThrow();

      expect(logged).toBeDefined();
      expect(logged?.['capLayer']).toBe('daily_cap');
      writeSpy.mockRestore();
    });
  });

  describe('tenant isolation', () => {
    it("does not count tenant B sessions toward tenant A's daily cap", async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 30; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId('tenant-b')
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      const result = await useCase.execute(baseInput());
      expect(result.sessionId).toBeTruthy();
    });
  });
});

class CapturingLlmProvider implements ILlmProvider {
  lastRequest: Parameters<ILlmProvider['complete']>[0] | undefined;

  async complete(request: Parameters<ILlmProvider['complete']>[0]) {
    this.lastRequest = request;
    return {
      text: 'captured response',
      inputTokens: 10,
      outputTokens: 5,
      modelId: 'fake-model',
      costUsd: new Decimal('0.000001'),
    };
  }
}

function todayInSaoPaulo(): string {
  return utcDateToLocalDate(new Date(), 'America/Sao_Paulo');
}

function staleSession(session: ChatbotSession, tenantId: string): ChatbotSession {
  return ChatbotSession.reconstitute({
    id: session.id,
    tenantId,
    clientIp: session.clientIp,
    startedAt: session.startedAt,
    lastMessageAt: new Date(Date.now() - 5 * 60 * 1000),
    conversationDate: session.conversationDate,
    messageCount: session.messageCount,
    status: 'ACTIVE',
  });
}
