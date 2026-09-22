import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const FAKE_MODEL_ID = 'fake-llm-e2e';

// DI-registered fake/noop ILlmProvider (M19-S11) — never performs real network I/O, never
// billed. Selectable only via CHATBOT_LLM_PROVIDER=fake (platform.module.ts), used by Playwright
// E2E so the real widget -> BFF -> backend -> adapter path can be exercised end to end without
// a real LLM provider call in CI. Never the production/staging default.
@Injectable()
export class FakeLlmAdapter implements ILlmProvider {
  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    // Truncated to maxOutputTokens (PR #385 review, Codex): a real adapter enforces this as a
    // hard ceiling passed to the provider API — an unbounded echo would let this fake stand in
    // for UC-033's own maxOutputTokensPerResponse cap without ever actually exercising it.
    // "Tokens" here are approximated as characters, same as inputTokens below — this adapter has
    // no real tokenizer, and none is needed for a deterministic echo never sent to a real LLM.
    const echo = `[fake-llm] echo: ${request.userMessage}`;
    const text = echo.slice(0, request.maxOutputTokens);

    return {
      text,
      inputTokens: request.userMessage.length,
      outputTokens: text.length,
      modelId: FAKE_MODEL_ID,
      costUsd: new Decimal(0),
    };
  }
}
