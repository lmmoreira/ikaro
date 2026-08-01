import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBffUrl, getBffUpstreamUrl } from './bff-url';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('getBffUpstreamUrl', () => {
  it('uses the server-only upstream URL on the web server', () => {
    process.env.BFF_UPSTREAM_URL = 'https://bff.internal.example/v1';
    process.env.NEXT_PUBLIC_BFF_URL = '/v1';

    expect(getBffUpstreamUrl()).toBe('https://bff.internal.example/v1');
  });

  it('falls back to the public URL when the server-only upstream is absent', () => {
    delete process.env.BFF_UPSTREAM_URL;
    process.env.NEXT_PUBLIC_BFF_URL = '/v1';

    expect(getBffUpstreamUrl()).toBe('/v1');
  });

  it('uses the runtime-injected public URL in browser code', () => {
    process.env.BFF_UPSTREAM_URL = 'https://bff.internal.example/v1';
    process.env.NEXT_PUBLIC_BFF_URL = '/v1';
    vi.stubGlobal('window', { __PUBLIC_ENV__: { NEXT_PUBLIC_BFF_URL: '/v1' } });

    expect(getBffUpstreamUrl()).toBe('/v1');
  });

  it('falls back to the browser build-time public URL when no runtime value is injected', () => {
    process.env.NEXT_PUBLIC_BFF_URL = '/v1';
    vi.stubGlobal('window', { __PUBLIC_ENV__: {} });

    expect(getBffUpstreamUrl()).toBe('/v1');
  });
});

describe('buildBffUrl', () => {
  it('appends a BFF path to the resolved base URL', () => {
    process.env.BFF_UPSTREAM_URL = 'https://bff.internal.example/v1';

    expect(buildBffUrl('/auth/google')).toBe('https://bff.internal.example/v1/auth/google');
  });

  it('normalizes a trailing slash on the base URL to avoid a double slash', () => {
    process.env.BFF_UPSTREAM_URL = 'https://bff.internal.example/v1/';

    expect(buildBffUrl('/auth/google')).toBe('https://bff.internal.example/v1/auth/google');
  });
});
