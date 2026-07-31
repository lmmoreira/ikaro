import { afterEach, describe, expect, it, vi } from 'vitest';

const getBffAuthorizationHeader = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/auth/google-identity-token', () => ({
  getBffAuthorizationHeader,
}));

import { attachBffAuthHeaders, resolveClientIp } from './bff-transport-headers';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  getBffAuthorizationHeader.mockReset();
});

describe('attachBffAuthHeaders', () => {
  it('throws when WEB_INTERNAL_KEY is unset', async () => {
    delete process.env.WEB_INTERNAL_KEY;

    await expect(attachBffAuthHeaders(new Headers())).rejects.toThrow(
      'WEB_INTERNAL_KEY is required for every BFF server call',
    );
  });

  it('sets X-Web-Internal-Key unconditionally, regardless of auth mode', async () => {
    process.env.WEB_INTERNAL_KEY = 'a'.repeat(32);
    process.env.BFF_AUTH_MODE = 'none';

    const headers = new Headers();
    await attachBffAuthHeaders(headers);

    expect(headers.get('x-web-internal-key')).toBe('a'.repeat(32));
    expect(headers.has('authorization')).toBe(false);
  });

  it("attaches a Google ID token when BFF_AUTH_MODE=iam, using BFF_UPSTREAM_URL's origin as the default audience", async () => {
    process.env.WEB_INTERNAL_KEY = 'a'.repeat(32);
    process.env.BFF_AUTH_MODE = 'iam';
    process.env.BFF_UPSTREAM_URL = 'https://bff-run-url.a.run.app/v1';
    delete process.env.BFF_AUDIENCE;
    getBffAuthorizationHeader.mockResolvedValue('Bearer test-token');

    const headers = new Headers();
    await attachBffAuthHeaders(headers);

    expect(getBffAuthorizationHeader).toHaveBeenCalledWith('https://bff-run-url.a.run.app');
    expect(headers.get('authorization')).toBe('Bearer test-token');
  });

  it('uses BFF_AUDIENCE as an explicit override when set', async () => {
    process.env.WEB_INTERNAL_KEY = 'a'.repeat(32);
    process.env.BFF_AUTH_MODE = 'iam';
    process.env.BFF_UPSTREAM_URL = 'https://bff-run-url.a.run.app/v1';
    process.env.BFF_AUDIENCE = 'https://custom-audience.example.com';
    getBffAuthorizationHeader.mockResolvedValue('Bearer test-token');

    const headers = new Headers();
    await attachBffAuthHeaders(headers);

    expect(getBffAuthorizationHeader).toHaveBeenCalledWith('https://custom-audience.example.com');
  });
});

describe('resolveClientIp', () => {
  it('resolves via CF-Connecting-IP when APP_ENV=production', () => {
    process.env.APP_ENV = 'production';

    const ip = resolveClientIp({ 'cf-connecting-ip': '203.0.113.10' });

    expect(ip).toBe('203.0.113.10');
  });

  it('resolves via the rightmost X-Forwarded-For hop when APP_ENV=staging', () => {
    process.env.APP_ENV = 'staging';

    const ip = resolveClientIp({ 'x-forwarded-for': '198.51.100.1, 203.0.113.99' });

    expect(ip).toBe('203.0.113.99');
  });

  it('defaults APP_ENV to "local" when unset', () => {
    delete process.env.APP_ENV;

    const ip = resolveClientIp({ 'x-forwarded-for': '198.51.100.1, 203.0.113.99' });

    expect(ip).toBe('203.0.113.99');
  });
});
