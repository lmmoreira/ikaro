import { afterEach, describe, expect, it, vi } from 'vitest';

const getIdTokenClient = vi.hoisted(() => vi.fn());

vi.mock('google-auth-library', () => ({
  // `new GoogleAuth()` requires a constructor-callable mock — an arrow function
  // implementation isn't (TypeError: not a constructor), unlike a plain function.
  GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
    return { getIdTokenClient };
  }),
}));

import { getBffAuthorizationHeader } from './google-identity-token';

interface MockRequestHeaders {
  get(name: string): string | null;
}

interface MockIdTokenClient {
  getRequestHeaders: ReturnType<typeof vi.fn>;
}

// This module holds a singleton cache Map (mirrors the BFF adapter's per-provider-instance
// cache, but there is no per-test `new Provider()` here since there's no NestJS DI) — every
// test below must use a distinct audience so cached state from one test never leaks into
// another via the shared module-level cache.
function mockClient(authorizationHeader: string | null): MockIdTokenClient {
  return {
    getRequestHeaders: vi.fn().mockResolvedValue({
      get: (name: string) => (name === 'authorization' ? authorizationHeader : null),
    } satisfies MockRequestHeaders),
  };
}

describe('getBffAuthorizationHeader', () => {
  afterEach(() => {
    getIdTokenClient.mockReset();
  });

  it('returns the Authorization header from a fresh ID token client', async () => {
    const client = mockClient('Bearer token-123');
    getIdTokenClient.mockResolvedValue(client);

    const result = await getBffAuthorizationHeader('https://bff-a.example.com');

    expect(result).toBe('Bearer token-123');
    expect(getIdTokenClient).toHaveBeenCalledWith('https://bff-a.example.com');
    expect(client.getRequestHeaders).toHaveBeenCalledWith('https://bff-a.example.com');
  });

  it('reuses the cached client for the same audience instead of creating a new one', async () => {
    const client = mockClient('Bearer token-456');
    getIdTokenClient.mockResolvedValue(client);

    await getBffAuthorizationHeader('https://bff-b.example.com');
    await getBffAuthorizationHeader('https://bff-b.example.com');

    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
  });

  it('creates a separate client per distinct audience', async () => {
    const client = mockClient('Bearer token-789');
    getIdTokenClient.mockResolvedValue(client);

    await getBffAuthorizationHeader('https://bff-c1.example.com');
    await getBffAuthorizationHeader('https://bff-c2.example.com');

    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
  });

  it('throws when the client returns no authorization header', async () => {
    const client = mockClient(null);
    getIdTokenClient.mockResolvedValue(client);

    await expect(getBffAuthorizationHeader('https://bff-d.example.com')).rejects.toThrow(
      'Failed to obtain a Google ID token for audience https://bff-d.example.com',
    );
  });

  it('evicts the cache on a rejected client so the next call retries fresh instead of failing forever', async () => {
    const client = mockClient('Bearer token-after-retry');
    getIdTokenClient
      .mockRejectedValueOnce(new Error('metadata server hiccup'))
      .mockResolvedValueOnce(client);

    await expect(getBffAuthorizationHeader('https://bff-e.example.com')).rejects.toThrow(
      'metadata server hiccup',
    );

    const result = await getBffAuthorizationHeader('https://bff-e.example.com');

    expect(result).toBe('Bearer token-after-retry');
    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
  });
});
