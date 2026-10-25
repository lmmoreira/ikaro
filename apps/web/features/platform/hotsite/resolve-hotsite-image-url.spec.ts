import { describe, expect, it } from 'vitest';
import { isTmpImagePath } from './resolve-hotsite-image-url';

describe('isTmpImagePath', () => {
  it('returns true for a tmp/ staging path', () => {
    expect(isTmpImagePath('tmp/tenant-a/branding/u1/logo.png')).toBe(true);
  });

  it('returns false for a permanent tenants/ path', () => {
    expect(isTmpImagePath('tenants/tenant-a/hotsite/branding/logo.png')).toBe(false);
  });

  it('returns false for a resolved public URL', () => {
    expect(isTmpImagePath('https://img.example.test/public/tenants/tenant-a/logo.png')).toBe(false);
  });

  it('returns false for an empty value', () => {
    expect(isTmpImagePath('')).toBe(false);
  });
});
