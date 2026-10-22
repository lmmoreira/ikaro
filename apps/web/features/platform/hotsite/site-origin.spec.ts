import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPublicHotsiteUrl, resolveSiteOrigin } from './site-origin';

describe('site-origin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    expect(resolveSiteOrigin()).toBe('http://localhost:3000');
  });

  it.each(['https://ikaro.app', 'https://ikaro.app/', 'https://ikaro.app///'])(
    'strips trailing slashes from %s',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', value);

      expect(resolveSiteOrigin()).toBe('https://ikaro.app');
    },
  );

  it('builds the public hotsite URL from the origin and the tenant slug', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ikaro.app/');

    expect(buildPublicHotsiteUrl('beloauto')).toBe('https://ikaro.app/beloauto');
  });
});
