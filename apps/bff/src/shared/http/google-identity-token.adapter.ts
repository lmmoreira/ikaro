import { Injectable } from '@nestjs/common';
import { GoogleAuth, IdTokenClient } from 'google-auth-library';
import { IIdentityTokenProvider } from './identity-token-provider.port';

// Wraps google-auth-library so no import of it leaks outside this adapter
// (anti-lock-in guardrail 1). IdTokenClient caches and refreshes the
// underlying token itself against the Cloud Run metadata server -- caching
// one client per audience here reuses that cache, rather than losing it by
// creating a fresh client on every call.
@Injectable()
export class GoogleIdentityTokenProvider implements IIdentityTokenProvider {
  private readonly auth = new GoogleAuth();
  private readonly clients = new Map<string, Promise<IdTokenClient>>();

  async getAuthorizationHeader(audience: string): Promise<string> {
    let clientPromise = this.clients.get(audience);
    if (!clientPromise) {
      clientPromise = this.auth.getIdTokenClient(audience);
      this.clients.set(audience, clientPromise);
    }

    const client = await clientPromise;
    const headers = await client.getRequestHeaders(audience);
    const authorization = headers.get('authorization');

    if (!authorization) {
      throw new Error(`Failed to obtain a Google ID token for audience ${audience}`);
    }

    return authorization;
  }
}
