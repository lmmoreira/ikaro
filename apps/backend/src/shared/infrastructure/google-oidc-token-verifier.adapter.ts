import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { IOidcTokenVerifier, OidcTokenPayload } from '../ports/oidc-token-verifier.port';

// PORTABILITY: Google ID-token verification (JWKS fetch + signature/exp/aud check against Google's
// issuer) is inherently GCP Pub/Sub-push-specific (D2 ledger). Confined to this single adapter behind
// IOidcTokenVerifier — swapping push providers means replacing this file only.
@Injectable()
export class GoogleOidcTokenVerifier implements IOidcTokenVerifier {
  private readonly client = new OAuth2Client();

  async verify(idToken: string, audience: string): Promise<OidcTokenPayload> {
    const ticket = await this.client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('OIDC token verification returned an empty payload');
    }

    return { iss: payload.iss, email: payload.email, email_verified: payload.email_verified };
  }
}
