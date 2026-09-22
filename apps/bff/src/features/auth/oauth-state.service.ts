import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  EncodedOAuthState,
  isValidReturnTo,
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

  encodeOAuthState(
    type: 'staff' | 'customer',
    tenantSlug?: string,
    returnTo?: string,
  ): EncodedOAuthState {
    const slug = tenantSlug && isValidSlug(tenantSlug) ? tenantSlug : undefined;
    // Invalid/mismatched returnTo is silently dropped, never rejected — it degrades to the
    // existing hotsite-home fallback in handleTenantLogin, it must never fail the login itself.
    const validReturnTo =
      slug && returnTo && isValidReturnTo(returnTo, slug) ? returnTo : undefined;
    const nonce = randomUUID();
    const payload: OAuthStatePayload = {
      nonce,
      ...(type === 'staff' ? { loginType: 'staff' as const } : {}),
      ...(slug ? { tenantSlug: slug } : {}),
      ...(validReturnTo ? { returnTo: validReturnTo } : {}),
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
    // Defense in depth — the signature already protects the payload from tampering, but
    // re-validating returnTo here means a future bug in encodeOAuthState (or a state signed by
    // an older, pre-validation build during a rolling deploy) still can't reach handleTenantLogin
    // with an unsafe redirect target.
    const returnTo =
      payload.returnTo &&
      payload.tenantSlug &&
      isValidReturnTo(payload.returnTo, payload.tenantSlug)
        ? payload.returnTo
        : undefined;
    return { loginType: payload.loginType, tenantSlug: payload.tenantSlug, returnTo };
  }
}
