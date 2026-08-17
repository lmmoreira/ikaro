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
  it('returns a deterministic reply referencing the user message', async () => {
    const adapter = new FakeLlmAdapter();

    const result = await adapter.complete(makeRequest());

    expect(result.text).toContain('Vocês abrem aos sábados?');
    expect(result.modelId).toBe('fake-llm-e2e');
  });

  // PR #385 review (Codex): the original version of this test only asserted on the returned
  // value, which would still pass even if an outbound call were added later — spying on fetch
  // is what actually proves no network I/O happens.
  it('never performs a real network call', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const adapter = new FakeLlmAdapter();

    await adapter.complete(makeRequest());

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
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

  // PR #385 review (Codex): the echo was previously unbounded, so this fake never actually
  // exercised UC-033's maxOutputTokensPerResponse ceiling the way a real adapter must.
  it('truncates the reply to maxOutputTokens, never exceeding the requested ceiling', async () => {
    const adapter = new FakeLlmAdapter();

    const result = await adapter.complete(
      makeRequest({ userMessage: 'a'.repeat(50), maxOutputTokens: 10 }),
    );

    expect(result.text).toHaveLength(10);
    expect(result.outputTokens).toBe(10);
  });
});
