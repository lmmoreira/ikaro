import { GoogleAuth } from 'google-auth-library';
import { GoogleIdentityTokenProvider } from './google-identity-token.adapter';

jest.mock('google-auth-library');

interface MockRequestHeaders {
  get(name: string): string | null;
}

interface MockIdTokenClient {
  getRequestHeaders: jest.Mock<Promise<MockRequestHeaders>, [string?]>;
}

describe('GoogleIdentityTokenProvider', () => {
  function mockClient(authorizationHeader: string | null): MockIdTokenClient {
    return {
      getRequestHeaders: jest.fn().mockResolvedValue({
        get: (name: string) => (name === 'authorization' ? authorizationHeader : null),
      }),
    };
  }

  it('returns the Authorization header from a fresh ID token client', async () => {
    const client = mockClient('Bearer token-123');
    const getIdTokenClient = jest.fn().mockResolvedValue(client);
    (GoogleAuth as jest.Mock).mockImplementation(() => ({ getIdTokenClient }));

    const provider = new GoogleIdentityTokenProvider();
    const result = await provider.getAuthorizationHeader('https://backend.example.com');

    expect(result).toBe('Bearer token-123');
    expect(getIdTokenClient).toHaveBeenCalledWith('https://backend.example.com');
    expect(client.getRequestHeaders).toHaveBeenCalledWith('https://backend.example.com');
  });

  it('reuses the cached client for the same audience instead of creating a new one', async () => {
    const client = mockClient('Bearer token-456');
    const getIdTokenClient = jest.fn().mockResolvedValue(client);
    (GoogleAuth as jest.Mock).mockImplementation(() => ({ getIdTokenClient }));

    const provider = new GoogleIdentityTokenProvider();
    await provider.getAuthorizationHeader('https://backend.example.com');
    await provider.getAuthorizationHeader('https://backend.example.com');

    expect(getIdTokenClient).toHaveBeenCalledTimes(1);
  });

  it('creates a separate client per distinct audience', async () => {
    const client = mockClient('Bearer token-789');
    const getIdTokenClient = jest.fn().mockResolvedValue(client);
    (GoogleAuth as jest.Mock).mockImplementation(() => ({ getIdTokenClient }));

    const provider = new GoogleIdentityTokenProvider();
    await provider.getAuthorizationHeader('https://backend-a.example.com');
    await provider.getAuthorizationHeader('https://backend-b.example.com');

    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
  });

  it('throws when the client returns no authorization header', async () => {
    const client = mockClient(null);
    const getIdTokenClient = jest.fn().mockResolvedValue(client);
    (GoogleAuth as jest.Mock).mockImplementation(() => ({ getIdTokenClient }));

    const provider = new GoogleIdentityTokenProvider();

    await expect(provider.getAuthorizationHeader('https://backend.example.com')).rejects.toThrow(
      'Failed to obtain a Google ID token for audience https://backend.example.com',
    );
  });

  it('evicts the cache on a rejected client so the next call retries fresh instead of failing forever', async () => {
    const client = mockClient('Bearer token-after-retry');
    const getIdTokenClient = jest
      .fn()
      .mockRejectedValueOnce(new Error('metadata server hiccup'))
      .mockResolvedValueOnce(client);
    (GoogleAuth as jest.Mock).mockImplementation(() => ({ getIdTokenClient }));

    const provider = new GoogleIdentityTokenProvider();

    await expect(provider.getAuthorizationHeader('https://backend.example.com')).rejects.toThrow(
      'metadata server hiccup',
    );

    const result = await provider.getAuthorizationHeader('https://backend.example.com');

    expect(result).toBe('Bearer token-after-retry');
    expect(getIdTokenClient).toHaveBeenCalledTimes(2);
  });
});
