import { ConfigService } from '@nestjs/config';
import { FrontendRevalidationAdapter } from './frontend-revalidation.adapter';

function makeConfigService(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    FRONTEND_URL: 'https://app.example.com',
    HOTSITE_REVALIDATE_SECRET: 'top-secret',
    ...overrides,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
}

describe('FrontendRevalidationAdapter', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the frontend revalidate endpoint with the slug and secret', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    const adapter = new FrontendRevalidationAdapter(makeConfigService());

    await adapter.revalidate('tenant-a');

    const [calledUrl, calledOptions] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.toString()).toBe(
      'https://app.example.com/api/revalidate?secret=top-secret&slug=tenant-a',
    );
    expect(calledOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('URL-encodes secrets and slugs containing special characters', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    const adapter = new FrontendRevalidationAdapter(
      makeConfigService({ HOTSITE_REVALIDATE_SECRET: 'a+b&c=d' }),
    );

    await adapter.revalidate('tenant a');

    const [calledUrl] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.searchParams.get('secret')).toBe('a+b&c=d');
    expect(calledUrl.searchParams.get('slug')).toBe('tenant a');
  });

  it('falls back to localhost and an empty secret when config values are absent', async () => {
    fetchSpy.mockResolvedValue({ ok: true, status: 200 } as Response);
    const adapter = new FrontendRevalidationAdapter(
      makeConfigService({ FRONTEND_URL: undefined, HOTSITE_REVALIDATE_SECRET: undefined }),
    );

    await adapter.revalidate('tenant-a');

    const [calledUrl] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(calledUrl.toString()).toBe('http://localhost:3000/api/revalidate?secret=&slug=tenant-a');
  });

  it('resolves without throwing when the response is not ok', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);
    const adapter = new FrontendRevalidationAdapter(makeConfigService());

    await expect(adapter.revalidate('tenant-a')).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch rejects', async () => {
    fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const adapter = new FrontendRevalidationAdapter(makeConfigService());

    await expect(adapter.revalidate('tenant-a')).resolves.toBeUndefined();
  });
});
