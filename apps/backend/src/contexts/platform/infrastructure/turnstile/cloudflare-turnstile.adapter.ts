import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { fetchAndParseJson } from '../../../../shared/utils/fetch-and-parse-json';
import { ITurnstileVerifierPort } from '../../application/ports/turnstile-verifier.port';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Matches the original BFF-side TurnstileService's timeout (M20-S05) — kept unchanged on
// relocation, not re-tuned.
const SITEVERIFY_TIMEOUT_MS = 8000;

const siteverifyResponseSchema = z.object({ success: z.boolean() });

@Injectable()
export class CloudflareTurnstileAdapter implements ITurnstileVerifierPort {
  constructor(private readonly config: ConfigService) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    try {
      // Deliberately inside the try, not before it (original reasoning, M20-S05 PR #423 review):
      // a missing/misconfigured secret must fail closed the same as a rejected/expired token,
      // never surface as an unhandled crash. Kept as getOrThrow (not OpenRouterLlmAdapter's own
      // `.get(key, '')` style) so "missing secret fails closed" stays an explicit, documented
      // contract rather than an accidental empty-string POST to Cloudflare.
      const secret = this.config.getOrThrow<string>('TURNSTILE_SECRET_KEY');
      const body = await fetchAndParseJson(
        SITEVERIFY_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secret, response: token, remoteip: remoteIp }),
          signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
        },
        siteverifyResponseSchema,
        'Cloudflare Turnstile',
      );
      return body.success === true;
    } catch {
      // Network/timeout failure against Cloudflare, or a missing/misconfigured secret, is
      // treated the same as a rejected token — fail closed (reject the submission), never fail
      // open and let spam through.
      return false;
    }
  }
}
