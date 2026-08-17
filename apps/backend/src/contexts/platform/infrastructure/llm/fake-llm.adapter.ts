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
    const text = `[fake-llm] echo: ${request.userMessage}`;

    return {
      text,
      inputTokens: request.userMessage.length,
      outputTokens: text.length,
      modelId: FAKE_MODEL_ID,
      costUsd: new Decimal(0),
    };
  }
}
