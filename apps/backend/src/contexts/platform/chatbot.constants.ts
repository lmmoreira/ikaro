// The registry's Map keys, one per LLM adapter (re-exported by application/ports/llm-provider.port.ts
// for the code that already imports them there). They live here, with the tier table that names
// them and the domain validator that checks an override against them, so no layer imports another
// just to spell a provider.
export const OPENROUTER_PROVIDER_NAME = 'openrouter';
export const ANTHROPIC_PROVIDER_NAME = 'anthropic';
export const OPENAI_PROVIDER_NAME = 'openai';
export const FAKE_PROVIDER_NAME = 'fake';

// Platform-wide chatbot defaults (docs/TENANTS_SETTINGS_SCHEMA.md §7, docs/USE_CASES.md UC-033).
// A tenant's row stays empty for all of these unless Ikaro grants an explicit per-tenant override.
// The caps resolve as `tenant override ?? the tenant's tier caps` (CHATBOT_TIER_CONFIG below, built
// from these constants), no longer as a bare `?? DEFAULT_X`. Changing a default here is a normal
// reviewed deploy, applying instantly to every tenant with no migration.
export const DEFAULT_MAX_KNOWLEDGE_TEXT_LENGTH = 4000;
export const DEFAULT_MAX_CONVERSATIONS_PER_DAY = 30;
export const DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY = 5;
export const DEFAULT_MAX_CONCURRENT_CONVERSATIONS = 5;
export const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 20;
export const DEFAULT_MAX_MESSAGE_LENGTH_CHARS = 1000;
export const DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM = 10;
export const DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE = 300;

// ---- Tiers (M26-S21) ----------------------------------------------------------------------
// Billing stores only the tier on the subscription item (`TenantAccessPort`); Platform maps it to
// a provider, a model and the caps here, never in Billing. Both tiers share the same caps: the
// tier changes the model, not the limits (docs/TENANTS_SETTINGS_SCHEMA.md § 7). A tenant override
// (`tenants.settings.chatbot`) still wins per value, see ChatbotConfigResolver.
export type ChatbotTier = 'BASIC' | 'PLUS';

// The OpenRouter adapter's own default model, and the `BASIC` tier's: one definition, so `BASIC`
// stays the adapter's default by construction. Only the prefixed form is an OpenRouter slug.
export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash-0731';
export const PLUS_OPENROUTER_MODEL = 'anthropic/claude-haiku-5.5';

// The other two adapters' own default models. Each prices only this model correctly (a private
// per-adapter constant, never OpenRouter's real `usage.cost`), so an operator override on those
// providers is accepted only with this model (see ChatbotSettingsValidator): the global daily
// spend limit sums each message's stored cost and must stay honest.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';

/**
 * The providers an operator override may name, each with the one model it is accepted with:
 * `null` means any model (OpenRouter reports the real cost of whatever it serves). The `fake`
 * provider is deliberately absent: it is selected only by CHATBOT_LLM_FAKE, never by a tenant.
 */
export const CHATBOT_OVERRIDE_PROVIDER_MODELS: ReadonlyMap<string, string | null> = new Map([
  [OPENROUTER_PROVIDER_NAME, null],
  [ANTHROPIC_PROVIDER_NAME, DEFAULT_ANTHROPIC_MODEL],
  [OPENAI_PROVIDER_NAME, DEFAULT_OPENAI_MODEL],
]);

/** A provider price ceiling in US$ per million tokens (OpenRouter `provider.max_price`). */
export interface ChatbotMaxPrice {
  prompt: number;
  completion: number;
}

// `BASIC`'s ceiling (M26-S21 decision 6): the adapter's own fixed ceiling (US$ 10 / 50) admits
// every DeepSeek flash endpoint, which puts `BASIC`'s worst case near 95% of its price; this one
// keeps it near a third. OpenRouter only: the other adapters have no price routing.
export const BASIC_CHATBOT_MAX_PRICE: ChatbotMaxPrice = { prompt: 0.15, completion: 0.5 };

/** The seven caps a tier carries (`maxKnowledgeTextLength` is fixed for every tier). */
export interface ChatbotCaps {
  maxConversationsPerDay: number;
  maxConversationsPerIpPerDay: number;
  maxConcurrentConversations: number;
  maxMessagesPerConversation: number;
  maxMessageLengthChars: number;
  maxHistoryMessagesSentToLlm: number;
  maxOutputTokensPerResponse: number;
}

export interface ChatbotTierConfig {
  provider: string;
  model: string;
  /** Sent only while the resolved model is this tier's own (see ChatbotConfigResolver). */
  maxPrice?: ChatbotMaxPrice;
  caps: ChatbotCaps;
}

const SHARED_TIER_CAPS: ChatbotCaps = {
  maxConversationsPerDay: DEFAULT_MAX_CONVERSATIONS_PER_DAY,
  maxConversationsPerIpPerDay: DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY,
  maxConcurrentConversations: DEFAULT_MAX_CONCURRENT_CONVERSATIONS,
  maxMessagesPerConversation: DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  maxMessageLengthChars: DEFAULT_MAX_MESSAGE_LENGTH_CHARS,
  maxHistoryMessagesSentToLlm: DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM,
  maxOutputTokensPerResponse: DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE,
};

export const CHATBOT_TIER_CONFIG: Record<ChatbotTier, ChatbotTierConfig> = {
  BASIC: {
    provider: OPENROUTER_PROVIDER_NAME,
    model: DEFAULT_OPENROUTER_MODEL,
    maxPrice: BASIC_CHATBOT_MAX_PRICE,
    caps: SHARED_TIER_CAPS,
  },
  // The model can change without repricing (M25-S02).
  PLUS: {
    provider: OPENROUTER_PROVIDER_NAME,
    model: PLUS_OPENROUTER_MODEL,
    caps: SHARED_TIER_CAPS,
  },
};

// No MODEL_PRICING lookup here (removed during M19-S04 story-discovery) — pricing is now each
// LLM adapter's own responsibility, not a shared cross-provider table: OpenRouter's adapter
// reads its real cost from the API response (usage.cost — always present, confirmed against
// OpenRouter's own docs); Anthropic's and OpenAI's adapters, which never receive cost from their
// APIs, each hold a private per-adapter pricing constant instead
// (infrastructure/llm/anthropic-llm.adapter.ts, infrastructure/llm/openai-llm.adapter.ts). The
// platform-wide daily spend circuit breaker (S05) now sums the cost_usd already stored on each
// chatbot_messages row rather than reconstructing it from tokens at query time.

// Platform-wide operational backstops (CHATBOT_GLOBAL_DAILY_SPEND_LIMIT_USD,
// CHATBOT_MIN_PROVIDER_BALANCE_USD, CHATBOT_PROVIDER_HEALTH_COOLDOWN_MINUTES) are plain env vars,
// never a tenants.settings field or a code constant here — no tenant should be able to opt out,
// and all three need to be bumpable in minutes during a real incident, not a deploy cycle. Their
// defaults live in apps/backend/src/config/env.validation.ts's Zod schema (single source of
// truth), read via IApplicationConfig.getOrThrow() — not duplicated as a constant in this file.
