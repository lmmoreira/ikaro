import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBffAudience, getBffAuthMode } from './bff-auth';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllEnvs();
});

describe('getBffAuthMode', () => {
  it('defaults to "none" when unset', () => {
    delete process.env.BFF_AUTH_MODE;
    vi.stubEnv('NODE_ENV', 'development');

    expect(getBffAuthMode()).toBe('none');
  });

  it('returns "iam" when explicitly set', () => {
    process.env.BFF_AUTH_MODE = 'iam';
    vi.stubEnv('NODE_ENV', 'development');

    expect(getBffAuthMode()).toBe('iam');
  });

  it('treats any non-"iam" value as "none"', () => {
    process.env.BFF_AUTH_MODE = 'typo';
    vi.stubEnv('NODE_ENV', 'development');

    expect(getBffAuthMode()).toBe('none');
  });

  it('throws when NODE_ENV=production and BFF_AUTH_MODE is not "iam"', () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.BFF_AUTH_MODE;

    expect(() => getBffAuthMode()).toThrow('BFF_AUTH_MODE must be "iam" when NODE_ENV=production');
  });

  it('accepts NODE_ENV=production when BFF_AUTH_MODE=iam', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.BFF_AUTH_MODE = 'iam';

    expect(getBffAuthMode()).toBe('iam');
  });
});

describe('getBffAudience', () => {
  it('returns undefined when unset', () => {
    delete process.env.BFF_AUDIENCE;

    expect(getBffAudience()).toBeUndefined();
  });

  it('returns the configured override', () => {
    process.env.BFF_AUDIENCE = 'https://bff-run-url.a.run.app';

    expect(getBffAudience()).toBe('https://bff-run-url.a.run.app');
  });
});
