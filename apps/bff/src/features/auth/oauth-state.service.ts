import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v7 as uuidv7 } from 'uuid';
import { isValidSlug, OAuthState, OAuthStatePayload } from './oauth-state';

const OAUTH_STATE_TTL = '5m';

// Wraps the existing routing payload (loginType/tenantSlug) in a signed, short-lived JWT
// instead of the old plain-string `state` — closes the CSRF/tampering gap while keeping
// staff/tenant login routing intact (M17-S32). Reuses the app's JwtService (JWT_SECRET,
// HS256) rather than a separate signing key.
@Injectable()
export class OAuthStateService {
  constructor(private readonly jwt: JwtService) {}

  encodeOAuthState(type: 'staff' | 'customer', tenantSlug?: string): string {
    const slug = tenantSlug && isValidSlug(tenantSlug) ? tenantSlug : undefined;
    const payload: OAuthStatePayload = {
      nonce: uuidv7(),
      ...(type === 'staff' ? { loginType: 'staff' as const } : {}),
      ...(slug ? { tenantSlug: slug } : {}),
    };
    return this.jwt.sign(payload, { expiresIn: OAUTH_STATE_TTL });
  }

  // Fails closed — throws on missing, tampered, or expired state. Never falls back to the
  // customer flow silently; callers (GoogleStrategy) must propagate the error.
  decodeOAuthState(state: string): OAuthState {
    if (!state) {
      throw new Error('OAuth state is missing');
    }
    try {
      const payload = this.jwt.verify<OAuthStatePayload>(state);
      return { loginType: payload.loginType, tenantSlug: payload.tenantSlug };
    } catch {
      throw new Error('OAuth state is invalid or expired');
    }
  }
}
