import type { Decimal } from 'decimal.js';

// Per-adapter DI tokens — one per concrete provider, all implementing ILlmProvider, so
// LlmProviderRegistry can hold every built adapter in a Map keyed by provider name
// (docs/ENGINEERING_RULES_BACKEND.md § OpenRouter chatbot). Each is registered with useClass (never useExisting).
export const OPENROUTER_LLM_PROVIDER = Symbol('OpenRouterLlmProvider');

// The registry's Map keys (and the providers the tier table and an operator override name) are
// defined once in chatbot.constants.ts, so the registry, the tier table and the domain validator
// can never drift apart (a mismatch would throw "Unknown LLM provider" at the first request).
export {
  ANTHROPIC_PROVIDER_NAME,
  FAKE_PROVIDER_NAME,
  OPENAI_PROVIDER_NAME,
  OPENROUTER_PROVIDER_NAME,
} from '../../chatbot.constants';

export const ANTHROPIC_LLM_PROVIDER = Symbol('AnthropicLlmProvider');

export const OPENAI_LLM_PROVIDER = Symbol('OpenAiLlmProvider');

// DI-registered fake/noop adapter (M19-S11) — selected for every tenant by CHATBOT_LLM_FAKE=true
// (local only, rejected anywhere else), never the production/staging default. Exists so a real running backend process (Playwright E2E,
// which exercises the genuine widget -> BFF -> backend -> adapter path against the already-
// running dev stack, not a network-level mock) has a free, non-billed provider to resolve to.
// Mirrors notification.module.ts's EMAIL_ADAPTER=mailhog precedent: a real, safe local adapter,
// not a test double swapped in via DI overrides (those only work for Jest, not a live process).
export const FAKE_LLM_PROVIDER = Symbol('FakeLlmProvider');

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  maxOutputTokens: number;
  // The resolved model (tenant override ?? the tenant's tier model, ChatbotConfigResolver),
  // resolved by the caller together with the provider. Optional: an adapter falls back to its own
  // default model when unset.
  model?: string;
  // A provider price ceiling in US$ per million tokens, set only while the resolved model is the
  // tier's own. Only the OpenRouter adapter has price routing and honours it (it replaces the
  // adapter's fixed ceiling); the other adapters ignore it.
  maxPrice?: { prompt: number; completion: number };
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
  // from stored tokens later — see docs/USE_CASES.md UC-033
  costUsd: Decimal;
}

export interface ILlmProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}
