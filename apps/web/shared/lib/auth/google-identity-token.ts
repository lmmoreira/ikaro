import 'server-only';
import { GoogleAuth, IdTokenClient } from 'google-auth-library';

// TD38: web mints its own Google ID token for its server-side calls to BFF, the same way BFF
// already does for its calls to the backend (M17-S47) -- mirrors
// apps/bff/src/shared/http/google-identity-token.adapter.ts exactly. No NestJS DI here; a
// module-scoped singleton plays the same caching role, since this file is imported once per
// server process the same way a Nest provider is instantiated once per app.
const auth = new GoogleAuth();
const clients = new Map<string, Promise<IdTokenClient>>();

export async function getBffAuthorizationHeader(audience: string): Promise<string> {
  let clientPromise = clients.get(audience);
  if (!clientPromise) {
    // Evict on rejection (e.g. a transient metadata-server hiccup) so the next call retries
    // fresh instead of permanently failing against a cached rejected promise for this audience.
    clientPromise = auth.getIdTokenClient(audience).catch((error: unknown) => {
      clients.delete(audience);
      throw error;
    });
    clients.set(audience, clientPromise);
  }

  const client = await clientPromise;
  const headers = await client.getRequestHeaders(audience);
  const authorization = headers.get('authorization');

  if (!authorization) {
    throw new Error(`Failed to obtain a Google ID token for audience ${audience}`);
  }

  return authorization;
}
