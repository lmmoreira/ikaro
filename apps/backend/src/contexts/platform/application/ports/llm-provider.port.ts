// Per-adapter DI tokens — one per concrete provider, all implementing ILlmProvider, so
// LlmProviderRegistry can hold every built adapter in a Map keyed by provider name
// (docs/discovery/CHATBOT/CHATBOT.md §4). Each is registered with useClass (never useExisting).
export const OPENROUTER_LLM_PROVIDER = Symbol('OpenRouterLlmProvider');

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionRequest {
  systemPrompt: string;
  history: ChatTurn[];
  userMessage: string;
  maxOutputTokens: number;
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
