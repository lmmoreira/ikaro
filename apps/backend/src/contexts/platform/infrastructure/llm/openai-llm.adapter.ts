import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new Error('OpenAI returned a malformed response: invalid JSON');
    }

    const parsed = openAiResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error(`OpenAI returned a malformed response: ${parsed.error.message}`);
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
