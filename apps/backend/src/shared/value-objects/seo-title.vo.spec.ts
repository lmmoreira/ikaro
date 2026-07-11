import { SeoErrorCode } from '@ikaro/types';
import { SeoTitle, SeoTitleValidationError } from './seo-title.vo';

describe('SeoTitle', () => {
  it('accepts a title at or under the max length', () => {
    expect(SeoTitle.isValid('a'.repeat(60))).toBe(true);
    expect(SeoTitle.isValid('Lavagem completa em BeloAuto')).toBe(true);
    expect(SeoTitle.isValid('')).toBe(true);
  });

  it('rejects a title over the max length', () => {
    expect(SeoTitle.isValid('a'.repeat(61))).toBe(false);
  });

  it('create returns the value unchanged for a valid title', () => {
    expect(SeoTitle.create('BeloAuto — Lavagem de carros').value).toBe(
      'BeloAuto — Lavagem de carros',
    );
  });

  it('create throws SeoTitleValidationError with TITLE_TOO_LONG for a title over the max length', () => {
    expect(() => SeoTitle.create('a'.repeat(61))).toThrow(SeoTitleValidationError);
    try {
      SeoTitle.create('a'.repeat(61));
    } catch (err) {
      expect((err as SeoTitleValidationError).code).toBe(SeoErrorCode.TITLE_TOO_LONG);
    }
  });

  it('reconstitute skips validation', () => {
    expect(SeoTitle.reconstitute('a'.repeat(61)).value).toBe('a'.repeat(61));
  });
});
