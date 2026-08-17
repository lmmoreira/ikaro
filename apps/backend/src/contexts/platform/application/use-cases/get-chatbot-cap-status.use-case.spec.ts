import { todayInSaoPaulo } from '../../../../test/utils/chatbot-test-helpers';
import { ChatbotSessionBuilder } from '../../../../test/builders/platform';
import { InMemoryChatbotSessionRepository } from '../../../../test/repositories/platform';
import {
  GetChatbotCapStatusUseCase,
  GetChatbotCapStatusUseCaseInput,
} from './get-chatbot-cap-status.use-case';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('GetChatbotCapStatusUseCase', () => {
  let sessionRepo: InMemoryChatbotSessionRepository;

  function baseInput(
    overrides: Partial<GetChatbotCapStatusUseCaseInput> = {},
  ): GetChatbotCapStatusUseCaseInput {
    return {
      tenantId: TENANT_ID,
      chatbotSettings: {},
      timezone: 'America/Sao_Paulo',
      ...overrides,
    };
  }

  beforeEach(() => {
    sessionRepo = new InMemoryChatbotSessionRepository();
  });

  it('reports the cap as not reached when today has zero conversations', async () => {
    const useCase = new GetChatbotCapStatusUseCase(sessionRepo);

    const result = await useCase.execute(baseInput());

    expect(result).toEqual({ dailyCapReachedToday: false });
  });

  it('reports the cap as reached once the default daily cap (30) is met', async () => {
    for (let i = 0; i < 30; i++) {
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(TENANT_ID)
          .withConversationDate(todayInSaoPaulo())
          .build(),
      );
    }
    const useCase = new GetChatbotCapStatusUseCase(sessionRepo);

    const result = await useCase.execute(baseInput());

    expect(result).toEqual({ dailyCapReachedToday: true });
  });

  it('respects a tenant override of maxConversationsPerDay', async () => {
    for (let i = 0; i < 2; i++) {
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(TENANT_ID)
          .withConversationDate(todayInSaoPaulo())
          .build(),
      );
    }
    const useCase = new GetChatbotCapStatusUseCase(sessionRepo);

    const result = await useCase.execute(
      baseInput({ chatbotSettings: { maxConversationsPerDay: 2 } }),
    );

    expect(result).toEqual({ dailyCapReachedToday: true });
  });

  it("does not count tenant B's sessions toward tenant A's daily cap", async () => {
    for (let i = 0; i < 30; i++) {
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId('tenant-b')
          .withConversationDate(todayInSaoPaulo())
          .build(),
      );
    }
    const useCase = new GetChatbotCapStatusUseCase(sessionRepo);

    const result = await useCase.execute(baseInput());

    expect(result).toEqual({ dailyCapReachedToday: false });
  });

  it("agrees with GetChatbotStatusUseCase/SendChatMessageUseCase's own daily-cap boundary — one below cap is available, exactly at cap is not", async () => {
    for (let i = 0; i < 29; i++) {
      await sessionRepo.save(
        new ChatbotSessionBuilder()
          .withTenantId(TENANT_ID)
          .withConversationDate(todayInSaoPaulo())
          .build(),
      );
    }
    const useCase = new GetChatbotCapStatusUseCase(sessionRepo);

    const belowCap = await useCase.execute(baseInput());
    expect(belowCap).toEqual({ dailyCapReachedToday: false });

    await sessionRepo.save(
      new ChatbotSessionBuilder()
        .withTenantId(TENANT_ID)
        .withConversationDate(todayInSaoPaulo())
        .build(),
    );
    const atCap = await useCase.execute(baseInput());
    expect(atCap).toEqual({ dailyCapReachedToday: true });
  });
});
