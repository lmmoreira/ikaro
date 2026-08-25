import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SiteverifyResponse {
  success: boolean;
}

/**
 * M20-S05 — first Cloudflare Turnstile integration in this codebase, and the first raw
 * third-party outbound HTTP call in this BFF (Google OAuth goes through passport-google-oauth20,
 * not a raw call). Reuses the existing HttpService/axios (@nestjs/axios, already imported for
 * BackendHttpService) rather than introducing a new HTTP client.
 */
@Injectable()
export class TurnstileService {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async verify(token: string, remoteIp: string): Promise<boolean> {
    const secret = this.config.getOrThrow<string>('TURNSTILE_SECRET_KEY');
    try {
      const { data } = await firstValueFrom(
        this.http.post<SiteverifyResponse>(
          SITEVERIFY_URL,
          { secret, response: token, remoteip: remoteIp },
          { timeout: 8_000 },
        ),
      );
      return data.success === true;
    } catch {
      // Network/timeout failure against Cloudflare is treated the same as a rejected token —
      // fail closed (reject the submission), never fail open and let spam through.
      return false;
    }
  }
}
