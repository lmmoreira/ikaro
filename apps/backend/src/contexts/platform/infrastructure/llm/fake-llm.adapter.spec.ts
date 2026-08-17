import { Decimal } from 'decimal.js';
import { ChatCompletionRequest } from '../../application/ports/llm-provider.port';
import { FakeLlmAdapter } from './fake-llm.adapter';

function makeRequest(overrides?: Partial<ChatCompletionRequest>): ChatCompletionRequest {
  return {
    systemPrompt: 'You are a helpful assistant.',
    history: [],
    userMessage: 'Vocês abrem aos sábados?',
    maxOutputTokens: 300,
    ...overrides,
  };
}

describe('FakeLlmAdapter', () => {
  it('returns a deterministic reply referencing the user message, never a real network call', async () => {
    const adapter = new FakeLlmAdapter();

    const result = await adapter.complete(makeRequest());

    expect(result.text).toContain('Vocês abrem aos sábados?');
    expect(result.modelId).toBe('fake-llm-e2e');
  });

  it('always costs zero — never billed', async () => {
    const adapter = new FakeLlmAdapter();

    const result = await adapter.complete(makeRequest());

    expect(result.costUsd).toEqual(new Decimal(0));
  });

  it('reports non-negative input/output token counts derived from the request/response text', async () => {
    const adapter = new FakeLlmAdapter();

    const result = await adapter.complete(makeRequest({ userMessage: 'Oi' }));

    expect(result.inputTokens).toBeGreaterThan(0);
    expect(result.outputTokens).toBeGreaterThan(0);
  });
});
