import { SlugErrorCode } from '@ikaro/types';
import { Slug, SlugValidationError } from './slug.vo';

describe('Slug', () => {
  it('accepts valid slugs', () => {
    expect(Slug.isValid('lavacar-belo')).toBe(true);
    expect(Slug.isValid('autowash123')).toBe(true);
    expect(Slug.isValid('a')).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(Slug.isValid('Lavacar')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(Slug.isValid('lavacar belo')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(Slug.isValid('lavacar!')).toBe(false);
    expect(Slug.isValid('lavacar_belo')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(Slug.isValid('')).toBe(false);
  });

  it('create returns a Slug for a valid value', () => {
    const s = Slug.create('lavacar-belo');
    expect(s.value).toBe('lavacar-belo');
    expect(s.toString()).toBe('lavacar-belo');
  });

  it('create throws SlugValidationError with FORMAT_INVALID for an invalid value', () => {
    expect(() => Slug.create('Invalid Slug!')).toThrow(SlugValidationError);
    try {
      Slug.create('Invalid Slug!');
    } catch (err) {
      expect((err as SlugValidationError).code).toBe(SlugErrorCode.FORMAT_INVALID);
    }
  });
});
