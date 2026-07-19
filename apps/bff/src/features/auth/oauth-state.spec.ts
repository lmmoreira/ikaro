import { isValidSlug } from './oauth-state';

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
