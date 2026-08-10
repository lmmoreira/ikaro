// Per-adapter DI tokens — one per concrete provider, all implementing ILlmProvider, so
// LlmProviderRegistry can hold every built adapter in a Map keyed by provider name
// (docs/discovery/CHATBOT/CHATBOT.md §4). Each is registered with useClass (never useExisting).
export const OPENROUTER_LLM_PROVIDER = Symbol('OpenRouterLlmProvider');

// The registry's Map key for the OpenRouter adapter — also platform.module.ts's factory
// fallback when CHATBOT_LLM_PROVIDER is entirely unset. Centralized here so the two can never
// drift apart (a mismatch would throw "Unknown LLM provider" at the first unconfigured request).
export const OPENROUTER_PROVIDER_NAME = 'openrouter';

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
}

export interface ILlmProvider {
  complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
}
