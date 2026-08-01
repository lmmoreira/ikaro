import 'server-only';
import { GoogleAuth, IdTokenClient } from 'google-auth-library';

// TD38: web mints its own Google ID token for its server-side calls to BFF, the same way BFF
// already does for its calls to the backend (M17-S47) -- mirrors
// apps/bff/src/shared/http/google-identity-token.adapter.ts exactly. No NestJS DI here; a
// module-scoped singleton plays the same caching role, since this file is imported once per
// server process the same way a Nest provider is instantiated once per app.
const auth = new GoogleAuth();
const clients = new Map<string, Promise<IdTokenClient>>();

// This now runs on every authenticated web-to-BFF request (attachBffAuthHeaders), so a slow
// metadata server must not stall the calling request indefinitely -- google-auth-library's own
// internal timeout is environment-dependent and not a hard guarantee for this specific call
// path (CodeRabbit finding, TD38 PR #298 review).
const BFF_ID_TOKEN_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), BFF_ID_TOKEN_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function getBffAuthorizationHeader(audience: string): Promise<string> {
  let clientPromise = clients.get(audience);
  if (!clientPromise) {
    // Evict on rejection (e.g. a transient metadata-server hiccup, or the timeout below) so
    // the next call retries fresh instead of permanently failing against a cached rejected
    // promise for this audience.
    clientPromise = withTimeout(
      auth.getIdTokenClient(audience),
      `Timed out obtaining a Google ID token client for audience ${audience}`,
    ).catch((error: unknown) => {
      clients.delete(audience);
      throw error;
    });
    clients.set(audience, clientPromise);
  }

  const client = await clientPromise;
  const headers = await withTimeout(
    client.getRequestHeaders(audience),
    `Timed out fetching Google ID token headers for audience ${audience}`,
  );
  const authorization = headers.get('authorization');

  if (!authorization) {
    throw new Error(`Failed to obtain a Google ID token for audience ${audience}`);
  }

  return authorization;
}
