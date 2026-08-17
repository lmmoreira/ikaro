import type { Decimal } from 'decimal.js';

// Per-adapter DI tokens — one per concrete provider, all implementing ILlmProvider, so
// LlmProviderRegistry can hold every built adapter in a Map keyed by provider name
// (docs/discovery/CHATBOT/CHATBOT.md §4). Each is registered with useClass (never useExisting).
export const OPENROUTER_LLM_PROVIDER = Symbol('OpenRouterLlmProvider');

// The registry's Map key for the OpenRouter adapter — also platform.module.ts's factory
// fallback when CHATBOT_LLM_PROVIDER is entirely unset. Centralized here so the two can never
// drift apart (a mismatch would throw "Unknown LLM provider" at the first unconfigured request).
export const OPENROUTER_PROVIDER_NAME = 'openrouter';

export const ANTHROPIC_LLM_PROVIDER = Symbol('AnthropicLlmProvider');
export const ANTHROPIC_PROVIDER_NAME = 'anthropic';

export const OPENAI_LLM_PROVIDER = Symbol('OpenAiLlmProvider');
export const OPENAI_PROVIDER_NAME = 'openai';

// DI-registered fake/noop adapter (M19-S11) — selectable via CHATBOT_LLM_PROVIDER=fake, never
// the production/staging default. Exists so a real running backend process (Playwright E2E,
// which exercises the genuine widget -> BFF -> backend -> adapter path against the already-
// running dev stack, not a network-level mock) has a free, non-billed provider to resolve to.
// Mirrors notification.module.ts's EMAIL_ADAPTER=mailhog precedent: a real, safe local adapter,
// not a test double swapped in via DI overrides (those only work for Jest, not a live process).
export const FAKE_LLM_PROVIDER = Symbol('FakeLlmProvider');
export const FAKE_PROVIDER_NAME = 'fake';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  maxOutputTokens: number;
  // Tenant override (tenant.settings.chatbot?.llmModel ?? adapter's own default) — resolved by
  // the caller the same way as llmProvider (docs/discovery/CHATBOT/CHATBOT.md §5's identical
  // "tenant.settings.chatbot?.X ?? DEFAULT_X" pattern for every one of the 10 chatbot settings).
  // Optional: an adapter falls back to its own default model when unset.
  model?: string;
}

export interface ChatCompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  // USD cost of this exact call. OpenRouter's adapter reads this straight from the API response
  // (usage.cost — confirmed always present); Anthropic's and OpenAI's adapters compute it from
  // inputTokens/outputTokens against a local per-adapter pricing constant, since neither provider
  // returns cost in its response. Callers persist this directly rather than reconstructing cost
  // from stored tokens later — see docs/discovery/CHATBOT/CHATBOT.md §8.9.
  costUsd: Decimal;
}

export interface ILlmProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}
