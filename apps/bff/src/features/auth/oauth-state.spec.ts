import { decodeOAuthState, encodeOAuthState, isValidSlug } from './oauth-state';

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

describe('encodeOAuthState()', () => {
  describe('staff', () => {
    it('returns __staff__ when no tenantSlug', () => {
      expect(encodeOAuthState('staff')).toBe('__staff__');
    });

    it('returns __staff__:<slug> for a valid tenantSlug', () => {
      expect(encodeOAuthState('staff', 'lavacar-bh')).toBe('__staff__:lavacar-bh');
    });

    it('falls back to __staff__ when tenantSlug has invalid characters', () => {
      expect(encodeOAuthState('staff', '../hack')).toBe('__staff__');
    });

    it('falls back to __staff__ when tenantSlug is empty string', () => {
      expect(encodeOAuthState('staff', '')).toBe('__staff__');
    });
  });

  describe('customer', () => {
    it('returns empty string when no tenantSlug', () => {
      expect(encodeOAuthState('customer')).toBe('');
    });

    it('returns the slug when tenantSlug is valid', () => {
      expect(encodeOAuthState('customer', 'lavacar-bh')).toBe('lavacar-bh');
    });

    it('returns empty string when tenantSlug is invalid', () => {
      expect(encodeOAuthState('customer', '../evil')).toBe('');
    });
  });
});

describe('decodeOAuthState()', () => {
  it('returns empty state for an empty string', () => {
    expect(decodeOAuthState('')).toEqual({ tenantSlug: undefined });
  });

  it('decodes a bare valid tenant slug', () => {
    expect(decodeOAuthState('lavacar-bh')).toEqual({ tenantSlug: 'lavacar-bh' });
  });

  it('clears tenantSlug when state contains invalid slug characters', () => {
    expect(decodeOAuthState('../evil')).toEqual({ tenantSlug: undefined });
  });

  it('decodes __staff__ as staff login without tenantSlug', () => {
    expect(decodeOAuthState('__staff__')).toEqual({ loginType: 'staff', tenantSlug: undefined });
  });

  it('decodes __staff__:<slug> as staff login with tenantSlug', () => {
    expect(decodeOAuthState('__staff__:lavacar-bh')).toEqual({
      loginType: 'staff',
      tenantSlug: 'lavacar-bh',
    });
  });

  it('clears tenantSlug when __staff__: suffix has invalid characters', () => {
    expect(decodeOAuthState('__staff__:../hack')).toEqual({
      loginType: 'staff',
      tenantSlug: undefined,
    });
  });

  it('clears tenantSlug when __staff__: suffix is empty', () => {
    expect(decodeOAuthState('__staff__:')).toEqual({ loginType: 'staff', tenantSlug: undefined });
  });
});
