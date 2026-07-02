import { afterEach, describe, expect, it } from 'vitest';
import { buildGoogleOAuthUrl } from './google-oauth';

describe('buildGoogleOAuthUrl', () => {
  const originalBffUrl = process.env.NEXT_PUBLIC_BFF_URL;

  afterEach(() => {
    if (originalBffUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BFF_URL;
    } else {
      process.env.NEXT_PUBLIC_BFF_URL = originalBffUrl;
    }
  });

  it('builds the tenant-scoped Google auth URL from the configured BFF base URL', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com/v1/';

    expect(buildGoogleOAuthUrl({ tenantSlug: 'lavacar-bh' })).toBe(
      'https://bff.example.com/v1/auth/google?tenantSlug=lavacar-bh',
    );
  });

  it('adds the staff type and encodes the tenant slug', () => {
    expect(
      buildGoogleOAuthUrl({
        bffUrl: 'https://bff.example.com/v1',
        tenantSlug: 'lavacar bh',
        type: 'staff',
      }),
    ).toBe('https://bff.example.com/v1/auth/google?tenantSlug=lavacar+bh&type=staff');
  });

  it('throws when the BFF base URL is missing', () => {
    delete process.env.NEXT_PUBLIC_BFF_URL;

    expect(() => buildGoogleOAuthUrl({ tenantSlug: 'lavacar-bh' })).toThrow(
      'NEXT_PUBLIC_BFF_URL is required',
    );
  });
});
