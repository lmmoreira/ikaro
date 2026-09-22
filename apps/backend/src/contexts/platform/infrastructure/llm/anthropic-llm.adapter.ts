import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ChatTurn,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
// Fallback when ChatCompletionRequest.model is unset — the tenant override
// (tenant.settings.chatbot?.llmModel) takes precedence when the caller provides one.
// Cost/speed tier, chosen so `thinking` never needs to be sent: this model doesn't think
// unless explicitly enabled, unlike Opus/Sonnet/Fable-tier Claude models, which run adaptive
// thinking on by default and share the same max_tokens budget as the visible answer — the same
// class of silent-cost/truncation trap openrouter-llm.adapter.ts guards against via
// `reasoning: { effort: "none" }`. A future tenant `llmModel` override to one of those models
// is not protected against here (plan/M19-HOTSITE-CHATBOT.md M19-S03).
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';
const ANTHROPIC_TIMEOUT_MS = 30000;

// Anthropic's Messages API never returns cost in its response (confirmed against the live docs,
// 2026-08-11 — usage only carries token/cache/thinking counts), unlike OpenRouter's usage.cost.
// Priced for DEFAULT_ANTHROPIC_MODEL only — same known gap as the model-override comment above:
// a tenant `llmModel` override to a different Claude tier is not priced correctly here, it's
// still computed at this rate. Verified against the claude-api skill's cached model table
// (2026-06-24) — re-verify before trusting this for real billing decisions; prices move fast.
const ANTHROPIC_PRICING = { inputPerMillionTokensUsd: 1.0, outputPerMillionTokensUsd: 5.0 };

function computeCostUsd(inputTokens: number, outputTokens: number): Decimal {
  return new Decimal(inputTokens)
    .times(ANTHROPIC_PRICING.inputPerMillionTokensUsd)
    .plus(new Decimal(outputTokens).times(ANTHROPIC_PRICING.outputPerMillionTokensUsd))
    .dividedBy(1_000_000);
}

// Validated at runtime, not just cast — a 200 response with an empty content array or missing
// usage (a filtered/refusal response, an upstream schema change) must fail as a controlled
// error, not an untyped TypeError from an unchecked property access (same discipline as
// openrouter-llm.adapter.ts's openRouterResponseSchema, cross-tool review finding on PR #353).
const anthropicResponseSchema = z.object({
  model: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

@Injectable()
export class AnthropicLlmAdapter implements ILlmProvider {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('ANTHROPIC_API_KEY', '');
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const messages: ChatTurn[] = [
      ...request.history,
      { role: 'user', content: request.userMessage },
    ];
    const responseBody = await this.callAnthropicApi(request, messages);
    const { text, usage, model } = this.parseAndValidate(responseBody);

    return {
      text,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      modelId: model,
      costUsd: computeCostUsd(usage.input_tokens, usage.output_tokens),
    };
  }

  private async callAnthropicApi(
    request: ChatCompletionRequest,
    messages: ChatTurn[],
  ): Promise<unknown> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model ?? DEFAULT_ANTHROPIC_MODEL,
        system: request.systemPrompt,
        max_tokens: request.maxOutputTokens,
        messages,
      }),
      signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('Anthropic returned a malformed response: invalid JSON');
    }
  }

  private parseAndValidate(responseBody: unknown): {
    text: string;
    usage: { input_tokens: number; output_tokens: number };
    model: string;
  } {
    const parsed = anthropicResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error(`Anthropic returned a malformed response: ${parsed.error.message}`);
    }
    const body = parsed.data;
    const textBlock = body.content.find((block) => block.type === 'text');
    if (textBlock?.text === undefined) {
      throw new Error('Anthropic returned a malformed response: no text content block');
    }
    return { text: textBlock.text, usage: body.usage, model: body.model };
  }
}
