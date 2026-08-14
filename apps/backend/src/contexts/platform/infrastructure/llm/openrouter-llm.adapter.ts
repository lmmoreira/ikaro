import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { fetchAndParseJson } from '../../../../shared/utils/fetch-and-parse-json';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Fallback when ChatCompletionRequest.model is unset — the tenant override
// (tenant.settings.chatbot?.llmModel) takes precedence when the caller provides one.
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash-0731';
const OPENROUTER_TIMEOUT_MS = 30000;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Validated at runtime, not just cast — a 200 response with an empty choices array or missing
// usage (a filtered/refusal response, an upstream schema change) must fail as a controlled
// error, not an untyped TypeError from an unchecked property access (cross-tool review finding
// on PR #353). `cost` is required (not `.nullable()`) on the same "fail loud on unexpected
// shape" principle as the rest of this schema: OpenRouter's own docs confirm usage.cost is
// always included automatically on every response — a null/missing cost is exactly the kind of
// unexpected upstream shape this schema exists to catch as a controlled error, not a value to
// silently default to zero (which would silently undercount the platform-wide spend breaker).
const openRouterResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    cost: z.number(),
  }),
});

// docs/discovery/CHATBOT/CHATBOT.md §3/§4: reasoning.effort must always be sent explicitly as
// "none" — the API defaults to "high" if unset, and reasoning tokens bill as output tokens
// whether or not they're returned. Even "low" starved the visible answer on 8/19 real eval
// questions once max_tokens had to cover reasoning + answer combined — "none" is the only
// effort level confirmed not to hit that failure mode.
@Injectable()
export class OpenRouterLlmAdapter implements ILlmProvider {
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENROUTER_API_KEY', '');
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: request.userMessage },
    ];

    const body = await fetchAndParseJson(
      OPENROUTER_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: request.model ?? DEFAULT_OPENROUTER_MODEL,
          reasoning: { effort: 'none' },
          max_tokens: request.maxOutputTokens,
          messages,
        }),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      },
      openRouterResponseSchema,
      'OpenRouter',
    );

    return {
      text: body.choices[0].message.content,
      inputTokens: body.usage.prompt_tokens,
      outputTokens: body.usage.completion_tokens,
      modelId: body.model,
      costUsd: new Decimal(body.usage.cost),
    };
  }
}
