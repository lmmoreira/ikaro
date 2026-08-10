import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  ChatCompletionRequest,
  ChatCompletionResult,
  ILlmProvider,
} from '../../application/ports/llm-provider.port';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash-0731';
const OPENROUTER_TIMEOUT_MS = 30000;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Validated at runtime, not just cast — a 200 response with an empty choices array or missing
// usage (a filtered/refusal response, an upstream schema change) must fail as a controlled
// error, not an untyped TypeError from an unchecked property access (cross-tool review finding
// on PR #353).
const openRouterResponseSchema = z.object({
  model: z.string(),
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
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

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        reasoning: { effort: 'none' },
        max_tokens: request.maxOutputTokens,
        messages,
      }),
      signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
    }

    const parsed = openRouterResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(`OpenRouter returned a malformed response: ${parsed.error.message}`);
    }
    const body = parsed.data;

    return {
      text: body.choices[0].message.content,
      inputTokens: body.usage.prompt_tokens,
      outputTokens: body.usage.completion_tokens,
      modelId: body.model,
    };
  }
}
