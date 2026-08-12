import { ConfigService } from '@nestjs/config';
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
  GetChatbotStatusUseCase,
  GetChatbotStatusUseCaseInput,
} from './get-chatbot-status.use-case';

function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, defaultValue: string) => overrides[key] ?? defaultValue,
  } as unknown as ConfigService;
}

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('GetChatbotStatusUseCase', () => {
  let sessionRepo: InMemoryChatbotSessionRepository;
  let messageRepo: InMemoryChatbotMessageRepository;
  let balanceRepo: InMemoryChatbotProviderBalanceRepository;
  let llmProvider: ILlmProvider;

  function buildUseCase(config: ConfigService = fakeConfig()): GetChatbotStatusUseCase {
    llmProvider = new FakeLlmProviderBuilder().build();
    const registry = new LlmProviderRegistry('openrouter', llmProvider, llmProvider, llmProvider);
    return new GetChatbotStatusUseCase(sessionRepo, messageRepo, balanceRepo, registry, config);
  }

  function baseInput(
    overrides: Partial<GetChatbotStatusUseCaseInput> = {},
  ): GetChatbotStatusUseCaseInput {
    return {
      tenantId: TENANT_ID,
      chatbotSettings: {},
      timezone: 'America/Sao_Paulo',
      ...overrides,
    };
  }

  beforeEach(() => {
    sessionRepo = new InMemoryChatbotSessionRepository();
    messageRepo = new InMemoryChatbotMessageRepository();
    balanceRepo = new InMemoryChatbotProviderBalanceRepository();
  });

  it('is available when none of the 5 conditions trip', async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute(baseInput());

    expect(result).toEqual({ available: true });
  });

  it('is pure read — no writes to any repository', async () => {
    const sessionSaveSpy = jest.spyOn(sessionRepo, 'save');
    const messageSaveSpy = jest.spyOn(messageRepo, 'save');
    const balanceSaveSpy = jest.spyOn(balanceRepo, 'saveBalance');
    const balanceRecordSpy = jest.spyOn(balanceRepo, 'recordCallOutcome');
    const useCase = buildUseCase();

    await useCase.execute(baseInput());

    expect(sessionSaveSpy).not.toHaveBeenCalled();
    expect(messageSaveSpy).not.toHaveBeenCalled();
    expect(balanceSaveSpy).not.toHaveBeenCalled();
    expect(balanceRecordSpy).not.toHaveBeenCalled();
  });

  describe('(a) tenant daily cap', () => {
    it('is unavailable once the default daily cap is reached', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 30; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: false });
    });

    it('respects a tenant override of maxConversationsPerDay', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 2; i++) {
        await sessionRepo.save(
          new ChatbotSessionBuilder()
            .withTenantId(TENANT_ID)
            .withConversationDate(todayInSaoPaulo())
            .build(),
        );
      }

      const result = await useCase.execute(
        baseInput({ chatbotSettings: { maxConversationsPerDay: 2 } }),
      );

      expect(result).toEqual({ available: false });
    });
  });

  describe('(b) tenant concurrency cap', () => {
    it('is unavailable once the default concurrency cap is reached', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        await sessionRepo.save(new ChatbotSessionBuilder().withTenantId(TENANT_ID).build());
      }

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: false });
    });

    it('does not count a session last active more than 2 minutes ago', async () => {
      const useCase = buildUseCase();
      for (let i = 0; i < 5; i++) {
        await sessionRepo.save(staleSession(TENANT_ID));
      }

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });
  });

  describe('(c) provider health check', () => {
    it('is unavailable when the resolved provider is unhealthy (failure within the cooldown window)', async () => {
      await balanceRepo.recordCallOutcome('openrouter', 'FAILURE', new Date());
      const useCase = buildUseCase(fakeConfig({ CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES: '5' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: false });
    });

    it('is available once the configured cooldown has elapsed since the last failure', async () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      await balanceRepo.recordCallOutcome('openrouter', 'FAILURE', sixMinutesAgo);
      const useCase = buildUseCase(fakeConfig({ CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES: '5' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });

    it('is available when a later success redeems an earlier failure', async () => {
      await balanceRepo.recordCallOutcome('openrouter', 'FAILURE', new Date(Date.now() - 60_000));
      await balanceRepo.recordCallOutcome('openrouter', 'SUCCESS', new Date());
      const useCase = buildUseCase(fakeConfig({ CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES: '5' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });

    it('checks the health of the tenant-overridden provider, not the platform default', async () => {
      await balanceRepo.recordCallOutcome('openrouter', 'FAILURE', new Date());
      const useCase = buildUseCase(fakeConfig({ CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES: '5' }));

      const result = await useCase.execute(
        baseInput({ chatbotSettings: { llmProvider: 'anthropic' } }),
      );

      expect(result).toEqual({ available: true });
    });

    it('is available when no balance/health row exists yet for the resolved provider', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });
  });

  describe('(d) global daily spend breaker', () => {
    it("is unavailable once today's spend meets the configured limit", async () => {
      await messageRepo.save(
        new ChatbotMessageBuilder().withTenantId(TENANT_ID).withCostUsd('25').build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD: '25' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: false });
    });

    it('is available when spend is below the configured limit', async () => {
      await messageRepo.save(
        new ChatbotMessageBuilder().withTenantId(TENANT_ID).withCostUsd('1').build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD: '25' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });
  });

  describe('(e) provider balance floor', () => {
    it('is unavailable once the resolved provider balance is below the minimum', async () => {
      await balanceRepo.saveBalance(
        new ChatbotProviderBalanceBuilder().withProvider('openrouter').withRemainingUsd(1).build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: false });
    });

    it('checks the balance of the tenant-overridden provider, not the platform default', async () => {
      await balanceRepo.saveBalance(
        new ChatbotProviderBalanceBuilder().withProvider('openrouter').withRemainingUsd(0).build(),
      );
      await balanceRepo.saveBalance(
        new ChatbotProviderBalanceBuilder().withProvider('anthropic').withRemainingUsd(50).build(),
      );
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      const result = await useCase.execute(
        baseInput({ chatbotSettings: { llmProvider: 'anthropic' } }),
      );

      expect(result).toEqual({ available: true });
    });

    it('is available when no balance row exists yet — never a live external call, never a false trip', async () => {
      const useCase = buildUseCase();

      const result = await useCase.execute(baseInput());

      expect(result).toEqual({ available: true });
    });

    it('is available for a provider with no prepaid-balance concept (remainingUsd stays null even with a health row)', async () => {
      await balanceRepo.recordCallOutcome('anthropic', 'SUCCESS', new Date());
      const useCase = buildUseCase(fakeConfig({ CHATBOT_MIN_PROVIDER_BALANCE_USD: '2' }));

      const result = await useCase.execute(
        baseInput({ chatbotSettings: { llmProvider: 'anthropic' } }),
      );

      expect(result).toEqual({ available: true });
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

      expect(result).toEqual({ available: true });
    });
  });
});

function todayInSaoPaulo(): string {
  return utcDateToLocalDate(new Date(), 'America/Sao_Paulo');
}

function staleSession(tenantId: string): ChatbotSession {
  const session = new ChatbotSessionBuilder().withTenantId(tenantId).build();
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
