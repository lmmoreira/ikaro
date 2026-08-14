import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from 'decimal.js';
import { z } from 'zod';

const OPENROUTER_CREDITS_API_URL = 'https://openrouter.ai/api/v1/credits';
const OPENROUTER_CREDITS_TIMEOUT_MS = 10000;

// GET /api/v1/credits requires a Management (Provisioning) API key — a distinct credential from
// OPENROUTER_API_KEY (S02's chat-completions key). Confirmed against OpenRouter's own live API
// reference during M19-S08 implementation, 2026-08-14: "Management key required... Only
// management keys can perform this operation." A regular completions key gets a 401/403 here.
const openRouterCreditsResponseSchema = z.object({
  data: z.object({
    total_credits: z.number(),
    total_usage: z.number(),
  }),
});

@Injectable()
export class OpenRouterCreditsClient {
  private readonly managementApiKey: string;

  constructor(config: ConfigService) {
    this.managementApiKey = config.get<string>('OPENROUTER_MANAGEMENT_API_KEY', '');
  }

  /** Remaining balance in USD = total_credits - total_usage. Throws on any failure — the
   * caller (ChatbotBalancePollJob) is responsible for catching this and treating it as the
   * documented "API failure" case (log a warning, leave the stored row unchanged). */
  async getRemainingBalanceUsd(): Promise<Decimal> {
    const response = await fetch(OPENROUTER_CREDITS_API_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.managementApiKey}`,
      },
      signal: AbortSignal.timeout(OPENROUTER_CREDITS_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter credits request failed: ${response.status} ${await response.text()}`,
      );
    }

    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      throw new Error('OpenRouter credits returned a malformed response: invalid JSON');
    }

    const parsed = openRouterCreditsResponseSchema.safeParse(responseBody);
    if (!parsed.success) {
      throw new Error(`OpenRouter credits returned a malformed response: ${parsed.error.message}`);
    }

    return new Decimal(parsed.data.data.total_credits).minus(parsed.data.data.total_usage);
  }
}
