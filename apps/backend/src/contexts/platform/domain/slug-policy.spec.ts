import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RESERVED_SLUGS, SlugPolicy } from './slug-policy';

const strict = { allowOwnerSlug: false };
const operator = { allowOwnerSlug: true };

describe('SlugPolicy', () => {
  const policy = new SlugPolicy('ikaro');

  describe('format', () => {
    it.each([
      ['abc', 'valid'],
      ['a'.repeat(30), 'valid'],
      ['lava-car-top', 'valid'],
      ['a--b', 'valid'],
      ['123', 'valid'],
    ])('accepts %s', (slug) => {
      expect(policy.validate(slug, strict)).toEqual({ kind: 'valid' });
    });

    it.each([
      ['', 'TOO_SHORT'],
      ['ab', 'TOO_SHORT'],
      ['a'.repeat(31), 'TOO_LONG'],
      ['-abc', 'INVALID_HYPHEN'],
      ['abc-', 'INVALID_HYPHEN'],
      ['Lavacar', 'INVALID_CHARACTERS'],
      ['lava car', 'INVALID_CHARACTERS'],
      ['lavação', 'INVALID_CHARACTERS'],
      ['a_b', 'INVALID_CHARACTERS'],
    ])('rejects %s as %s', (slug, reason) => {
      expect(policy.validate(slug, strict)).toEqual({ kind: 'invalid', reason });
    });

    it('reports characters before length so the first fix is the one the user sees', () => {
      expect(policy.validate('A', strict)).toEqual({
        kind: 'invalid',
        reason: 'INVALID_CHARACTERS',
      });
    });
  });

  describe('reserved words', () => {
    it.each([
      'dashboard',
      'bookings',
      'select-staff-tenant',
      'ikaro-trial',
      'www',
      'login',
      'account',
      'admin',
      'suporte',
      'support',
    ])('reserves %s on every path', (slug) => {
      expect(policy.validate(slug, strict)).toEqual({ kind: 'reserved' });
      expect(policy.validate(slug, operator)).toEqual({ kind: 'reserved' });
    });

    it('does not reserve a word that only starts with ikaro-', () => {
      expect(policy.validate('ikaro-lavacar', strict)).toEqual({ kind: 'valid' });
    });

    it('is case sensitive: an uppercase reserved word is a format error, not reserved', () => {
      expect(policy.validate('Admin', strict)).toEqual({
        kind: 'invalid',
        reason: 'INVALID_CHARACTERS',
      });
    });
  });

  describe('owner slug', () => {
    it('is reserved for self-signup', () => {
      expect(policy.validate('ikaro', strict)).toEqual({ kind: 'reserved' });
    });

    it('is accepted by the operator path, even though it is on the static list', () => {
      expect(RESERVED_SLUGS.has('ikaro')).toBe(true);
      expect(policy.validate('ikaro', operator)).toEqual({ kind: 'valid' });
    });

    it('lets the operator provision only the owner slug, never another reserved word', () => {
      expect(policy.validate('admin', operator)).toEqual({ kind: 'reserved' });
    });

    it('reserves an owner slug that is not on the static list', () => {
      const custom = new SlugPolicy('ikaro-staging');

      expect(custom.validate('ikaro-staging', strict)).toEqual({ kind: 'reserved' });
      expect(custom.validate('ikaro-staging', operator)).toEqual({ kind: 'valid' });
    });

    it('with no owner slug configured, ikaro is reserved on the operator path too', () => {
      const none = new SlugPolicy(null);

      expect(none.validate('ikaro', operator)).toEqual({ kind: 'reserved' });
      expect(none.validate('lavacar', operator)).toEqual({ kind: 'valid' });
    });
  });
});

// Drift guard (M26-S22): a new top-level directory of apps/web/app is a new route that a tenant slug
// would shadow. Dynamic segments ([slug]) and files are not routes a slug can collide with.
describe('reserved slugs vs apps/web/app', () => {
  const webApp = resolve(__dirname, '../../../../../web/app');

  it('reserves every top-level route segment of the web app', () => {
    expect(existsSync(webApp)).toBe(true);
    const segments = readdirSync(webApp).filter(
      (name) => statSync(join(webApp, name)).isDirectory() && !name.startsWith('['),
    );

    expect(segments.length).toBeGreaterThan(0);
    const missing = segments.filter((name) => !RESERVED_SLUGS.has(name));
    expect(missing).toEqual([]);
  });
});
