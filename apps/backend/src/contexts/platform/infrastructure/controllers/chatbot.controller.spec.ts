import { HttpException, HttpStatus } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  ChatbotSessionBuilder,
  FakeLlmProviderBuilder,
  TenantSettingsPropsBuilder,
} from '../../../../test/builders/platform';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import {
  InMemoryChatbotMessageRepository,
  InMemoryChatbotProviderBalanceRepository,
  InMemoryChatbotSessionRepository,
} from '../../../../test/repositories/platform';
import { fakeConfig } from '../../../../test/utils/fake-config';
import { todayInSaoPaulo } from '../../../../test/utils/chatbot-test-helpers';
import { DEFAULT_MAX_CONVERSATIONS_PER_DAY } from '../../chatbot.constants';
import { ILlmProvider } from '../../application/ports/llm-provider.port';
import { LlmProviderRegistry } from '../../application/services/llm-provider-registry.service';
import { GetChatbotStatusUseCase } from '../../application/use-cases/get-chatbot-status.use-case';
import { SendChatMessageUseCase } from '../../application/use-cases/send-chat-message.use-case';
import { ChatbotController } from './chatbot.controller';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const CLIENT_IP = '203.0.113.10';

// Real use cases wired to InMemory repos — never `jest.fn()` mocks of the use case itself
// (docs/ANTI_PATTERNS.md: "jest.fn() mock for a use case in a controller unit test" is forbidden).
// This proves the controller's own field-mapping/error-mapping logic against real behaviour;
// chatbot.controller.integration.spec.ts covers the full HTTP + real Postgres wiring on top.
describe('ChatbotController', () => {
  let sessionRepo: InMemoryChatbotSessionRepository;
  let messageRepo: InMemoryChatbotMessageRepository;
  let balanceRepo: InMemoryChatbotProviderBalanceRepository;

  function buildController(
    settingsOverrides: Record<string, unknown> = {},
    providers: { openRouter?: ILlmProvider; anthropic?: ILlmProvider; openAi?: ILlmProvider } = {},
  ): ChatbotController {
    const settings = new TenantSettingsPropsBuilder().withChatbot(settingsOverrides).build();
    const requestContext = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withSettings(settings)
      .build();
    const defaultProvider = new FakeLlmProviderBuilder().build();
    const registry = new LlmProviderRegistry(
      'openrouter',
      providers.openRouter ?? defaultProvider,
      providers.anthropic ?? defaultProvider,
      providers.openAi ?? defaultProvider,
    );
    const config = fakeConfig();
    const sendChatMessage = new SendChatMessageUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      new InMemoryTransactionManager(),
      config,
    );
    const getChatbotStatus = new GetChatbotStatusUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      config,
    );
    return new ChatbotController(
      requestContext as unknown as RequestContext,
      sendChatMessage,
      getChatbotStatus,
    );
  }

  function buildControllerWithRawSettings(settings: Record<string, unknown>): ChatbotController {
    const requestContext = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withSettings(settings as never)
      .build();
    const provider = new FakeLlmProviderBuilder().build();
    const registry = new LlmProviderRegistry('openrouter', provider, provider, provider);
    const config = fakeConfig();
    const sendChatMessage = new SendChatMessageUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      new InMemoryTransactionManager(),
      config,
    );
    const getChatbotStatus = new GetChatbotStatusUseCase(
      sessionRepo,
      messageRepo,
      balanceRepo,
      registry,
      config,
    );
    return new ChatbotController(
      requestContext as unknown as RequestContext,
      sendChatMessage,
      getChatbotStatus,
    );
  }

  beforeEach(() => {
    sessionRepo = new InMemoryChatbotSessionRepository();
    messageRepo = new InMemoryChatbotMessageRepository();
    balanceRepo = new InMemoryChatbotProviderBalanceRepository();
  });

  it('forwards tenantId, clientIp, and message from the body + RequestContext into a real conversation', async () => {
    const controller = buildController();

    const result = await controller.sendMessage({
      systemPrompt: 'You are a helpful assistant.',
      message: 'Vocês trabalham aos sábados?',
      clientIp: CLIENT_IP,
    });

    expect(result.reply).toBe('Fake LLM response');
    const session = await sessionRepo.findById(result.sessionId, TENANT_ID);
    expect(session?.clientIp).toBe(CLIENT_IP);
    const messages = await messageRepo.findBySession(result.sessionId, TENANT_ID);
    expect(
      messages.some((m) => m.role === 'USER' && m.content === 'Vocês trabalham aos sábados?'),
    ).toBe(true);
  });

  it("resolves the tenant's chatbotSettings.llmProvider override from RequestContext and forwards it to the real use case", async () => {
    const controller = buildController(
      { knowledgeText: 'texto', llmProvider: 'anthropic' },
      { anthropic: new FakeLlmProviderBuilder().withText('Anthropic reply').build() },
    );

    const result = await controller.sendMessage({
      systemPrompt: 'prompt',
      message: 'oi',
      clientIp: CLIENT_IP,
    });

    expect(result.reply).toBe('Anthropic reply');
  });

  it('defaults chatbotSettings to {} when a tenant has no chatbot settings key at all', async () => {
    const settings = new TenantSettingsPropsBuilder().build() as unknown as Record<string, unknown>;
    delete settings['chatbot'];
    const controller = buildControllerWithRawSettings(settings);

    const result = await controller.sendMessage({
      systemPrompt: 'prompt',
      message: 'oi',
      clientIp: CLIENT_IP,
    });

    expect(result.reply).toBe('Fake LLM response');
  });

  it('maps a cap-rejection domain error to 429 HttpException', async () => {
    const today = todayInSaoPaulo();
    for (let i = 0; i < DEFAULT_MAX_CONVERSATIONS_PER_DAY; i++) {
      await sessionRepo.save(
        new ChatbotSessionBuilder().withTenantId(TENANT_ID).withConversationDate(today).build(),
      );
    }
    const controller = buildController();

    expect.assertions(2);
    try {
      await controller.sendMessage({ systemPrompt: 'p', message: 'oi', clientIp: CLIENT_IP });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });

  describe('getStatus', () => {
    it('is available by default', async () => {
      const controller = buildController();

      const result = await controller.getStatus();

      expect(result).toEqual({ available: true });
    });

    it("reflects the tenant's chatbotSettings override from RequestContext (proves settings/timezone forwarding)", async () => {
      const today = todayInSaoPaulo();
      await sessionRepo.save(
        new ChatbotSessionBuilder().withTenantId(TENANT_ID).withConversationDate(today).build(),
      );
      // Default cap (30) would still be available with 1 session; only a forwarded override
      // of maxConversationsPerDay: 1 can make this trip, which proves the controller correctly
      // forwards settings.chatbot and settings.businessHours.timezone into the real use case.
      const controller = buildController({ maxConversationsPerDay: 1 });

      const result = await controller.getStatus();

      expect(result).toEqual({ available: false });
    });

    it('defaults chatbotSettings to {} when a tenant has no chatbot settings key at all', async () => {
      const settings = new TenantSettingsPropsBuilder().build() as unknown as Record<
        string,
        unknown
      >;
      delete settings['chatbot'];
      const controller = buildControllerWithRawSettings(settings);

      const result = await controller.getStatus();

      expect(result).toEqual({ available: true });
    });
  });
});
