import { isValidReturnTo, isValidSlug } from './oauth-state';

describe('isValidSlug()', () => {
  it.each(['lavacar-bh', 'a', 'abc-123', '0cool'])('returns true for valid slug: %s', (s) => {
    expect(isValidSlug(s)).toBe(true);
  });

  it.each(['', '../evil', 'UPPER', 'has space', '__staff__', '__staff__:lavacar'])(
    'returns false for: %s',
    (s) => {
      expect(isValidSlug(s)).toBe(false);
    },
  );
});

describe('isValidReturnTo()', () => {
  it('returns true for a path scoped to the given tenant slug', () => {
    expect(isValidReturnTo('/lavacar-bh/lead-form', 'lavacar-bh')).toBe(true);
  });

  it('returns false for a path under a different tenant slug', () => {
    expect(isValidReturnTo('/other-tenant/lead-form', 'lavacar-bh')).toBe(false);
  });

  it('returns false for an absolute URL (open-redirect attempt)', () => {
    expect(isValidReturnTo('https://evil.example.com/lavacar-bh/lead-form', 'lavacar-bh')).toBe(
      false,
    );
  });

  it('returns false for a protocol-relative URL (open-redirect attempt)', () => {
    expect(isValidReturnTo('//evil.example.com/lavacar-bh/lead-form', 'lavacar-bh')).toBe(false);
  });

  it('returns false for an empty returnTo', () => {
    expect(isValidReturnTo('', 'lavacar-bh')).toBe(false);
  });

  it('returns false for an empty tenantSlug', () => {
    expect(isValidReturnTo('/lavacar-bh/lead-form', '')).toBe(false);
  });

  it('returns false for a path that merely contains the slug, not prefixed by it', () => {
    expect(isValidReturnTo('/other/lavacar-bh/lead-form', 'lavacar-bh')).toBe(false);
  });

  it('returns false for a literal dot-segment traversal out of the tenant path (PR #433 review)', () => {
    expect(isValidReturnTo('/lavacar-bh/../other-tenant/lead-form', 'lavacar-bh')).toBe(false);
  });

  it('returns false for a percent-encoded dot-segment traversal (PR #433 review)', () => {
    expect(isValidReturnTo('/lavacar-bh/%2e%2e/other-tenant/lead-form', 'lavacar-bh')).toBe(false);
  });

  it('returns false for a malformed URL that the URL constructor cannot parse', () => {
    expect(isValidReturnTo('http://[::1', 'lavacar-bh')).toBe(false);
  });
});
