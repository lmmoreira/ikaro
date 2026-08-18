import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { fetchAndParseJson } from '../../../../shared/utils/fetch-and-parse-json';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Fallback when ChatCompletionRequest.model is unset — the tenant override
// (tenant.settings.chatbot?.llmModel) takes precedence when the caller provides one.
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash-0731';
// Deliberately short, not OpenRouter's own generic ~120s recommendation for long-running
// inference — this call sits behind a visitor actively waiting in a live chat widget, and this
// product already asks for short, concise answers (maxOutputTokens, reasoning:'none', the system
// prompt's own "seja conciso"). A real answer that size shouldn't need anywhere near this long; if
// it does, the visitor is better served by a fast, controlled "unavailable" than a long wait. Also
// bounds the BFF's own per-call timeout to CHATBOT_MESSAGE_TIMEOUT_MS
// (apps/bff/src/features/platform/platform.public.controller.ts) — keep the two in sync.
const OPENROUTER_TIMEOUT_MS = 8000;
// Real incident, 2026-08-18: OpenRouter's default price-based load balancing routed a request to
// a provider with 4.3s latency-to-first-token and 3.8 tok/s throughput, which the OPENROUTER_TIMEOUT_MS
// budget above correctly cut off — but a faster provider for the same model measured the same day
// (553ms latency, 12.8 tok/s) cost only ~11% more per token, and actually completed. Sorting by
// latency — what OpenRouter's own docs recommend for a chat UI, vs. throughput for long-output
// workloads — trades a marginal, evidence-backed cost delta for materially fewer of these timeouts.
// max_price is a generous backstop (OpenRouter's own USD-per-million-tokens units), not a binding
// budget — it's ~10x the actual observed cost for this model, there only to guard against a
// pathological outlier provider, never expected to exclude a normal one.
const OPENROUTER_PROVIDER_PREFERENCES = {
  sort: 'latency',
  max_price: { prompt: 1, completion: 2 },
} as const;

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
  private readonly logger = new AppLogger(OpenRouterLlmAdapter.name);

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('OPENROUTER_API_KEY', '');
  }

  async complete(request: ChatCompletionRequest): Promise<ChatCompletionResult> {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: request.systemPrompt },
      ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: request.userMessage },
    ];
    const model = request.model ?? DEFAULT_OPENROUTER_MODEL;

    // Debug-only visibility into the exact context sent to the provider (never the API key) —
    // silent by default, since AppLogger's minimum level is INFO unless LOG_LEVEL=DEBUG.
    this.logger.debug('OpenRouter request payload', {
      model,
      maxOutputTokens: request.maxOutputTokens,
      messages,
    });

    const body = await fetchAndParseJson(
      OPENROUTER_API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: 'none' },
          max_tokens: request.maxOutputTokens,
          messages,
          provider: OPENROUTER_PROVIDER_PREFERENCES,
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
