import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
// Fallback when ChatCompletionRequest.model is unset — the tenant override
// (tenant.settings.chatbot?.llmModel) takes precedence when the caller provides one.
// OpenAI's cheapest current flagship tier as of this writing (plan/M19-HOTSITE-CHATBOT.md
// M19-S03) — re-verify against OpenAI's own pricing page before assuming this is still current.
const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
const OPENAI_TIMEOUT_MS = 30000;

// OpenAI's Chat Completions API never returns cost in its response (confirmed against the live
// docs, 2026-08-11 — usage only carries prompt/completion/reasoning/cached token counts), unlike
// OpenRouter's usage.cost. Priced for DEFAULT_OPENAI_MODEL only — a tenant `llmModel` override to
// a different OpenAI tier is not priced correctly here, same known gap as the model-override
// comment above. Verified against developers.openai.com's live pricing page, 2026-08-11 — not
// training memory; re-verify before trusting this for real billing decisions, prices move fast.
const OPENAI_PRICING = { inputPerMillionTokensUsd: 0.2, outputPerMillionTokensUsd: 1.2 };

function computeCostUsd(inputTokens: number, outputTokens: number): Decimal {
  return new Decimal(inputTokens)
    .times(OPENAI_PRICING.inputPerMillionTokensUsd)
    .plus(new Decimal(outputTokens).times(OPENAI_PRICING.outputPerMillionTokensUsd))
    .dividedBy(1_000_000);
}

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Validated at runtime, not just cast — a 200 response with an empty choices array or missing
// usage must fail as a controlled error, not an untyped TypeError from an unchecked property
// access (same discipline as openrouter-llm.adapter.ts's openRouterResponseSchema, cross-tool
// review finding on PR #353).
const openAiResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
});

@Injectable()
export class OpenAiLlmAdapter implements ILlmProvider {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENAI_API_KEY', '');
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const messages: OpenAiMessage[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: request.userMessage },
    ];
    const responseBody = await this.callOpenAiApi(request, messages);
    const body = this.parseAndValidate(responseBody);

    return {
      text: body.choices[0].message.content,
      inputTokens: body.usage.prompt_tokens,
      outputTokens: body.usage.completion_tokens,
      modelId: body.model,
      costUsd: computeCostUsd(body.usage.prompt_tokens, body.usage.completion_tokens),
    };
  }

  private async callOpenAiApi(
    request: ChatCompletionRequest,
    messages: OpenAiMessage[],
  ): Promise<unknown> {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model ?? DEFAULT_OPENAI_MODEL,
        max_completion_tokens: request.maxOutputTokens,
        messages,
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('OpenAI returned a malformed response: invalid JSON');
    }
  }

  private parseAndValidate(responseBody: unknown): z.infer<typeof openAiResponseSchema> {
    const parsed = openAiResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error(`OpenAI returned a malformed response: ${parsed.error.message}`);
    }
    return parsed.data;
  }
}
