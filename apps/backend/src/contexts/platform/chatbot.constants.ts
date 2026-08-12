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

// No MODEL_PRICING lookup here (removed during M19-S04 story-discovery) — pricing is now each
// LLM adapter's own responsibility, not a shared cross-provider table: OpenRouter's adapter
// reads its real cost from the API response (usage.cost — always present, confirmed against
// OpenRouter's own docs); Anthropic's and OpenAI's adapters, which never receive cost from their
// APIs, each hold a private per-adapter pricing constant instead
// (infrastructure/llm/anthropic-llm.adapter.ts, infrastructure/llm/openai-llm.adapter.ts). The
// platform-wide daily spend circuit breaker (S05) now sums the cost_usd already stored on each
// chatbot_messages row rather than reconstructing it from tokens at query time.

// Platform-wide operational backstops — deliberately plain env vars, never a tenants.settings
// field (docs/21-TENANTS_SETTINGS_SCHEMA.md §7's own "Not in this category, on purpose" note):
// no tenant should be able to opt out, and both need to be bumpable in minutes during a real
// incident, not a deploy cycle. Read as `config.get('CHATBOT_X', DEFAULT_X)` by both S05 (which
// enforces them) and S06 (which pre-flight-checks them) — a single source of truth for the
// fallback value, not duplicated per call site.
export const DEFAULT_MIN_PROVIDER_BALANCE_USD = '2';
export const DEFAULT_PROVIDER_HEALTH_COOLDOWN_MINUTES = 5;
