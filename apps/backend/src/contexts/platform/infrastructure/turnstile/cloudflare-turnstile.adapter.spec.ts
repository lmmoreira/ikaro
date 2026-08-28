import { ConfigService } from '@nestjs/config';

// fetch-and-parse-json.ts constructs a shared undici Agent + retry interceptor at module-load
// time — mock undici before that module ever loads, same reasoning as
// openrouter-llm.adapter.spec.ts and fetch-and-parse-json.spec.ts.
const mockAgentCompose = jest.fn().mockReturnValue('mock-dispatcher');
const mockAgentCtor = jest.fn().mockImplementation(() => ({ compose: mockAgentCompose }));
const mockRetryInterceptor = jest.fn().mockReturnValue('mock-retry-interceptor');
const mockUndiciFetch = jest.fn();

jest.mock('undici', () => ({
  Agent: function MockAgent(...args: unknown[]) {
    return mockAgentCtor(...args);
  },
  fetch: (...args: unknown[]) => mockUndiciFetch(...args),
  interceptors: { retry: (...args: unknown[]) => mockRetryInterceptor(...args) },
}));

type CloudflareTurnstileAdapterModule = typeof import('./cloudflare-turnstile.adapter');
const {
  CloudflareTurnstileAdapter,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after jest.mock above
}: CloudflareTurnstileAdapterModule = require('./cloudflare-turnstile.adapter');

const SECRET = 'test-secret-key';

// `null` (not `undefined`) signals "missing" — a default parameter only substitutes for an
// omitted argument or an explicitly passed `undefined`, so `makeConfigService(undefined)` would
// silently fall back to SECRET instead of exercising the missing-secret path.
function makeConfigService(secret: string | null = SECRET): ConfigService {
  return {
    getOrThrow: () => {
      if (secret === null) {
        throw new Error('TURNSTILE_SECRET_KEY is not defined');
      }
      return secret;
    },
  } as unknown as ConfigService;
}

function mockSuccessResponse(success: boolean) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify({ success })),
  };
}

describe('CloudflareTurnstileAdapter', () => {
  beforeEach(() => {
    mockUndiciFetch.mockReset();
  });

  it('returns true when Cloudflare siteverify responds with success: true', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse(true));
    const adapter = new CloudflareTurnstileAdapter(makeConfigService());

    const result = await adapter.verify('valid-token', '203.0.113.10');

    expect(result).toBe(true);
    const [calledUrl, calledOptions] = mockUndiciFetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const body = JSON.parse(calledOptions.body as string);
    expect(body).toEqual({ secret: SECRET, response: 'valid-token', remoteip: '203.0.113.10' });
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns false when Cloudflare siteverify responds with success: false', async () => {
    mockUndiciFetch.mockResolvedValue(mockSuccessResponse(false));
    const adapter = new CloudflareTurnstileAdapter(makeConfigService());

    const result = await adapter.verify('rejected-or-expired-token', '203.0.113.10');

    expect(result).toBe(false);
  });

  it('returns false (fails closed) on a network/timeout error, never throwing', async () => {
    mockUndiciFetch.mockRejectedValue(new Error('timeout'));
    const adapter = new CloudflareTurnstileAdapter(makeConfigService());

    const result = await adapter.verify('any-token', '203.0.113.10');

    expect(result).toBe(false);
  });

  it('returns false (fails closed) when TURNSTILE_SECRET_KEY is missing, never throwing', async () => {
    const adapter = new CloudflareTurnstileAdapter(makeConfigService(null));

    const result = await adapter.verify('any-token', '203.0.113.10');

    expect(result).toBe(false);
    expect(mockUndiciFetch).not.toHaveBeenCalled();
  });
});
