import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicEnv, getServerPublicEnv } from './public-env';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('getPublicEnv — server side (no window)', () => {
  it('reads the real process.env value', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com/v1';
    expect(getPublicEnv('NEXT_PUBLIC_BFF_URL')).toBe('https://bff.example.com/v1');
  });

  it('returns an empty string when the env var is unset', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(getPublicEnv('NEXT_PUBLIC_SITE_URL')).toBe('');
  });
});

describe('getPublicEnv — client side (window present)', () => {
  it('reads from window.__PUBLIC_ENV__, not process.env', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://this-must-not-be-read.example.com';
    vi.stubGlobal('window', {
      __PUBLIC_ENV__: { NEXT_PUBLIC_BFF_URL: 'https://bff.injected.example.com' },
    });

    expect(getPublicEnv('NEXT_PUBLIC_BFF_URL')).toBe('https://bff.injected.example.com');
  });

  it('returns an empty string when the injected global has no value for the key', () => {
    vi.stubGlobal('window', { __PUBLIC_ENV__: {} });
    expect(getPublicEnv('NEXT_PUBLIC_SITE_URL')).toBe('');
  });

  it('returns an empty string when window.__PUBLIC_ENV__ itself is missing', () => {
    vi.stubGlobal('window', {});
    expect(getPublicEnv('NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL')).toBe('');
  });
});

describe('getServerPublicEnv', () => {
  it('returns all three keys from process.env', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com/v1';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = 'https://storage.example.com/bucket';

    expect(getServerPublicEnv()).toEqual({
      NEXT_PUBLIC_BFF_URL: 'https://bff.example.com/v1',
      NEXT_PUBLIC_SITE_URL: 'https://example.com',
      NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: 'https://storage.example.com/bucket',
    });
  });

  it('defaults missing keys to an empty string', () => {
    delete process.env.NEXT_PUBLIC_BFF_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL;

    expect(getServerPublicEnv()).toEqual({
      NEXT_PUBLIC_BFF_URL: '',
      NEXT_PUBLIC_SITE_URL: '',
      NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: '',
    });
  });
});
