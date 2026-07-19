import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  EncodedOAuthState,
  isValidSlug,
  OAuthState,
  OAuthStateInvalidError,
  OAuthStatePayload,
} from './oauth-state';

const OAUTH_STATE_TTL = '5m';

function nonceMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Wraps the existing routing payload (loginType/tenantSlug) in a signed, short-lived JWT
// instead of the old plain-string `state`, and binds it to the initiating browser via a
// mirrored nonce cookie (double-submit pattern) — closes both the tampering gap and the
// login-CSRF/authorization-code-injection gap a signature-only state would leave open
// (M17-S32). Reuses the app's JwtService (JWT_SECRET, HS256) rather than a separate key.
@Injectable()
export class OAuthStateService {
  constructor(private readonly jwt: JwtService) {}

  encodeOAuthState(type: 'staff' | 'customer', tenantSlug?: string): EncodedOAuthState {
    const slug = tenantSlug && isValidSlug(tenantSlug) ? tenantSlug : undefined;
    const nonce = randomUUID();
    const payload: OAuthStatePayload = {
      nonce,
      ...(type === 'staff' ? { loginType: 'staff' as const } : {}),
      ...(slug ? { tenantSlug: slug } : {}),
    };
    const state = this.jwt.sign(payload, { expiresIn: OAUTH_STATE_TTL });
    return { state, nonce };
  }

  // Fails closed — throws OAuthStateInvalidError on missing/tampered/expired state, or when
  // the nonce cookie is missing or doesn't match the state's nonce (the browser-binding check
  // — see OAuthStatePayload in oauth-state.ts). Never falls back to the customer flow
  // silently; callers (GoogleStrategy) must propagate the error.
  decodeOAuthState(state: string, cookieNonce: string | undefined): OAuthState {
    if (!state) {
      throw new OAuthStateInvalidError('OAuth state is missing');
    }
    let payload: OAuthStatePayload;
    try {
      payload = this.jwt.verify<OAuthStatePayload>(state);
    } catch {
      throw new OAuthStateInvalidError('OAuth state is invalid or expired');
    }
    if (!cookieNonce || !nonceMatches(cookieNonce, payload.nonce)) {
      throw new OAuthStateInvalidError(
        'OAuth state nonce does not match the browser that started the flow',
      );
    }
    return { loginType: payload.loginType, tenantSlug: payload.tenantSlug };
  }
}
