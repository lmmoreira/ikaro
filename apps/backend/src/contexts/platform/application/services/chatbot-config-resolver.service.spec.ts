import { TenantAccessBuilder } from '../../../../test/builders/shared';
import { FakeTracingPort } from '../../../../test/infrastructure/fake-tracing-port';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import {
  BASIC_CHATBOT_MAX_PRICE,
  CHATBOT_TIER_CONFIG,
  DEFAULT_MAX_CONCURRENT_CONVERSATIONS,
  DEFAULT_MAX_CONVERSATIONS_PER_DAY,
  DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY,
  DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM,
  DEFAULT_MAX_MESSAGE_LENGTH_CHARS,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE,
  DEFAULT_OPENROUTER_MODEL,
  PLUS_OPENROUTER_MODEL,
} from '../../chatbot.constants';
import { ChatbotConfigResolver } from './chatbot-config-resolver.service';

const TENANT_A = '01234567-0000-7000-8000-00000000000a';
const TENANT_B = '01234567-0000-7000-8000-00000000000b';

describe('ChatbotConfigResolver', () => {
  let accessPort: InMemoryTenantAccessPort;
  let tracingPort: FakeTracingPort;
  let resolver: ChatbotConfigResolver;

  beforeEach(() => {
    accessPort = new InMemoryTenantAccessPort();
    tracingPort = new FakeTracingPort();
    resolver = new ChatbotConfigResolver(accessPort, tracingPort);
  });

  describe('tier defaults', () => {
    it('resolves BASIC to exactly today’s effective values (non-regression snapshot)', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('BASIC').build());

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result).toEqual({
        entitled: true,
        tier: 'BASIC',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash-0731',
        maxPrice: BASIC_CHATBOT_MAX_PRICE,
        caps: {
          maxConversationsPerDay: 30,
          maxConversationsPerIpPerDay: 5,
          maxConcurrentConversations: 5,
          maxMessagesPerConversation: 20,
          maxMessageLengthChars: 1000,
          maxHistoryMessagesSentToLlm: 10,
          maxOutputTokensPerResponse: 300,
        },
        overrideApplied: false,
        overrideProblem: null,
      });
    });

    it('resolves PLUS to the M25-S02 values: provider openrouter, the prefixed model, the same caps, no ceiling', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('PLUS').build());

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.tier).toBe('PLUS');
      expect(result.provider).toBe('openrouter');
      expect(result.model).toBe('anthropic/claude-haiku-5.5');
      expect(result.model).not.toBe('claude-haiku-5.5');
      expect(result.maxPrice).toBeUndefined();
      expect(result.caps).toEqual(CHATBOT_TIER_CONFIG.BASIC.caps);
    });

    it('builds both tiers from the shared DEFAULT_* caps, and BASIC from the adapter default model', () => {
      expect(CHATBOT_TIER_CONFIG.BASIC.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(CHATBOT_TIER_CONFIG.PLUS.model).toBe(PLUS_OPENROUTER_MODEL);
      expect(CHATBOT_TIER_CONFIG.PLUS.caps).toEqual({
        maxConversationsPerDay: DEFAULT_MAX_CONVERSATIONS_PER_DAY,
        maxConversationsPerIpPerDay: DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY,
        maxConcurrentConversations: DEFAULT_MAX_CONCURRENT_CONVERSATIONS,
        maxMessagesPerConversation: DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
        maxMessageLengthChars: DEFAULT_MAX_MESSAGE_LENGTH_CHARS,
        maxHistoryMessagesSentToLlm: DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM,
        maxOutputTokensPerResponse: DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE,
      });
    });

    it('resolves a trial tenant (BASIC) and an unseeded tenant to BASIC', async () => {
      accessPort.seed(
        TENANT_A,
        new TenantAccessBuilder().withChatbotTier('BASIC').withStatus('TRIALING').build(),
      );

      const trial = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });
      const unseeded = await resolver.resolve({ tenantId: TENANT_B, chatbotSettings: {} });

      expect(trial.tier).toBe('BASIC');
      expect(unseeded.tier).toBe('BASIC');
    });

    it('resolves any access tier other than PLUS to BASIC', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('STANDARD').build());

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.tier).toBe('BASIC');
    });

    it('resolves the fail-open (degraded) answer to BASIC, never to an error', async () => {
      accessPort.seed(
        TENANT_A,
        new TenantAccessBuilder().withChatbotTier('BASIC').withDegraded().build(),
      );

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.entitled).toBe(true);
      expect(result.tier).toBe('BASIC');
    });

    it('takes a tier change on the next call (no state is kept between calls)', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('BASIC').build());
      const before = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('PLUS').build());
      const after = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(before.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(after.model).toBe(PLUS_OPENROUTER_MODEL);
    });
  });

  describe('entitlement', () => {
    it('is not entitled for a suspended tenant', async () => {
      accessPort.seedSuspended(TENANT_A);

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.entitled).toBe(false);
    });

    it('is not entitled when the plan has no CHATBOT feature', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withoutChatbot().build());

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.entitled).toBe(false);
    });

    it('is entitled again once the tenant is reactivated (the knowledge text is never touched here)', async () => {
      accessPort.seedSuspended(TENANT_A);
      accessPort.reactivate(TENANT_A);

      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.entitled).toBe(true);
    });
  });

  describe('operator override', () => {
    it('wins per value over the tier: a cap override changes only that cap', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { maxConversationsPerDay: 100 },
      });

      expect(result.caps.maxConversationsPerDay).toBe(100);
      expect(result.caps.maxConcurrentConversations).toBe(DEFAULT_MAX_CONCURRENT_CONVERSATIONS);
      expect(result.overrideApplied).toBe(true);
    });

    it('resolves a provider + model override as that pair', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmProvider: 'anthropic', llmModel: 'claude-haiku-4-5' },
      });

      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-haiku-4-5');
      expect(result.overrideApplied).toBe(true);
    });

    it('resolves a model-only override against the tier’s provider (openrouter)', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmModel: 'google/gemini-test' },
      });

      expect(result.provider).toBe('openrouter');
      expect(result.model).toBe('google/gemini-test');
    });

    it('drops the tier price ceiling when the model is overridden (a ceiling sized for DeepSeek would 404 a pricier model)', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmModel: 'anthropic/claude-sonnet-5' },
      });

      expect(result.maxPrice).toBeUndefined();
    });

    it('keeps the tier price ceiling when only a cap is overridden', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { maxMessagesPerConversation: 40 },
      });

      expect(result.maxPrice).toEqual(BASIC_CHATBOT_MAX_PRICE);
    });

    it('ignores a stored provider-only override: the tier’s values apply, the problem is reported, the chat is not failed', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmProvider: 'anthropic', maxConversationsPerDay: 7 },
      });

      expect(result.provider).toBe('openrouter');
      expect(result.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(result.maxPrice).toEqual(BASIC_CHATBOT_MAX_PRICE);
      expect(result.caps.maxConversationsPerDay).toBe(7);
      expect(result.overrideProblem).toContain('requires chatbot.llmModel');
    });

    it.each([
      ['an unknown provider', { llmProvider: 'vertex-ai', llmModel: 'x' }],
      [
        'the fake provider (selected only by CHATBOT_LLM_FAKE)',
        { llmProvider: 'fake', llmModel: 'x' },
      ],
      [
        'anthropic with a model it does not price correctly (keeps the global spend limit honest)',
        { llmProvider: 'anthropic', llmModel: 'claude-sonnet-5' },
      ],
      [
        'openai with a model it does not price correctly',
        { llmProvider: 'openai', llmModel: 'gpt-other' },
      ],
    ])('ignores a stored override naming %s, using the tier values', async (_label, settings) => {
      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: settings });

      expect(result.provider).toBe('openrouter');
      expect(result.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(result.overrideProblem).not.toBeNull();
      expect(result.overrideApplied).toBe(false);
    });

    it('accepts anthropic / openai with their own default model, and openrouter with any model', async () => {
      const anthropic = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmProvider: 'anthropic', llmModel: 'claude-haiku-4-5' },
      });
      const openrouter = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmProvider: 'openrouter', llmModel: 'anthropic/claude-sonnet-5' },
      });

      expect([anthropic.provider, anthropic.model, anthropic.overrideProblem]).toEqual([
        'anthropic',
        'claude-haiku-4-5',
        null,
      ]);
      expect([openrouter.provider, openrouter.overrideProblem]).toEqual(['openrouter', null]);
    });

    it('treats stored JSON nulls like absent keys: a model-only override with a null provider still applies, and all-null is no override', async () => {
      const modelOnly = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmProvider: null, llmModel: 'google/gemini-test' } as never,
      });
      const allNull = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: {
          llmProvider: null,
          llmModel: null,
          maxConversationsPerDay: null,
        } as never,
      });

      expect([modelOnly.provider, modelOnly.model, modelOnly.overrideProblem]).toEqual([
        'openrouter',
        'google/gemini-test',
        null,
      ]);
      expect(allNull.overrideApplied).toBe(false);
      expect(allNull.overrideProblem).toBeNull();
      expect(allNull.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(allNull.caps.maxConversationsPerDay).toBe(DEFAULT_MAX_CONVERSATIONS_PER_DAY);
    });

    it('reports no problem when there is no override', async () => {
      const result = await resolver.resolve({ tenantId: TENANT_A, chatbotSettings: {} });

      expect(result.overrideProblem).toBeNull();
    });

    it('carries no knowledge-text cap in either tier: maxKnowledgeTextLength is fixed for every tier', () => {
      expect(Object.keys(CHATBOT_TIER_CONFIG.BASIC.caps)).not.toContain('maxKnowledgeTextLength');
      expect(Object.keys(CHATBOT_TIER_CONFIG.PLUS.caps)).not.toContain('maxKnowledgeTextLength');
    });

    it('does not report an override for the tenant’s own knowledge text settings', async () => {
      const result = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { knowledgeText: 'texto', maxKnowledgeTextLength: 6000 },
      });

      expect(result.overrideApplied).toBe(false);
    });
  });

  describe('tenant isolation', () => {
    it('never lets one tenant’s tier or override change another tenant’s caps or model', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('PLUS').build());
      accessPort.seed(TENANT_B, new TenantAccessBuilder().withChatbotTier('BASIC').build());

      const a = await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { maxConversationsPerDay: 99, llmModel: 'x/y' },
      });
      const b = await resolver.resolve({ tenantId: TENANT_B, chatbotSettings: {} });

      expect(a.model).toBe('x/y');
      expect(b.model).toBe(DEFAULT_OPENROUTER_MODEL);
      expect(b.caps.maxConversationsPerDay).toBe(DEFAULT_MAX_CONVERSATIONS_PER_DAY);
      expect(accessPort.getAccessCalls).toEqual([TENANT_A, TENANT_B]);
    });
  });

  describe('observability', () => {
    it('sets the tier and the override flag on the active span', async () => {
      accessPort.seed(TENANT_A, new TenantAccessBuilder().withChatbotTier('PLUS').build());

      await resolver.resolve({
        tenantId: TENANT_A,
        chatbotSettings: { llmModel: 'x/y' },
      });

      expect(tracingPort.calls).toEqual([{ 'chatbot.tier': 'PLUS', 'chatbot.override': true }]);
    });
  });
});
