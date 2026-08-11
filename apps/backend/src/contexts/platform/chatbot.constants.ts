// Platform-wide chatbot defaults (docs/21-TENANTS_SETTINGS_SCHEMA.md §7, docs/discovery/CHATBOT/CHATBOT.md §8).
// A tenant's row stays empty for all of these unless Ikaro grants an explicit per-tenant override —
// resolve as `tenant.settings.chatbot?.X ?? DEFAULT_X`. Changing a default here is a normal reviewed
// deploy, applying instantly to every tenant with no migration.
export const DEFAULT_MAX_KNOWLEDGE_TEXT_LENGTH = 4000;
export const DEFAULT_MAX_CONVERSATIONS_PER_DAY = 30;
export const DEFAULT_MAX_CONVERSATIONS_PER_IP_PER_DAY = 5;
export const DEFAULT_MAX_CONCURRENT_CONVERSATIONS = 5;
export const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 20;
export const DEFAULT_MAX_MESSAGE_LENGTH_CHARS = 1000;
export const DEFAULT_MAX_HISTORY_MESSAGES_SENT_TO_LLM = 10;
export const DEFAULT_MAX_OUTPUT_TOKENS_PER_RESPONSE = 300;

// Per-1M-token list pricing for the global daily spend circuit breaker (S05, CHATBOT.md §8.9) —
// grouped by `model_id`, not by provider, so an Ikaro-granted per-tenant model override still
// contributes its actual cost to the platform total. Verified against each provider's own pricing
// page, not training memory: OpenRouter — CHATBOT.md §3 (2026-08-07); Anthropic — the `claude-api`
// skill's cached model table (2026-06-24); OpenAI — S03 story text (2026-08-11).
export interface ModelPricing {
  inputPerMillionTokensUsd: number;
  outputPerMillionTokensUsd: number;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  'deepseek/deepseek-v4-flash-0731': {
    inputPerMillionTokensUsd: 0.09,
    outputPerMillionTokensUsd: 0.18,
  },
  'claude-haiku-4-5': { inputPerMillionTokensUsd: 1.0, outputPerMillionTokensUsd: 5.0 },
  'gpt-5.6-luna': { inputPerMillionTokensUsd: 0.2, outputPerMillionTokensUsd: 1.2 },
};
