import { SeoErrorCode } from '@ikaro/types';
import { SeoDescription, SeoDescriptionValidationError } from './seo-description.vo';

describe('SeoDescription', () => {
  it('accepts a description at or under the max length', () => {
    expect(SeoDescription.isValid('a'.repeat(158))).toBe(true);
    expect(SeoDescription.isValid('Agende sua lavagem completa em segundos.')).toBe(true);
    expect(SeoDescription.isValid('')).toBe(true);
  });

  it('rejects a description over the max length', () => {
    expect(SeoDescription.isValid('a'.repeat(159))).toBe(false);
  });

  it('create returns the value unchanged for a valid description', () => {
    const description = 'Agende em segundos e acompanhe tudo pelo celular.';
    expect(SeoDescription.create(description).value).toBe(description);
  });

  it('create throws SeoDescriptionValidationError with DESCRIPTION_TOO_LONG for a description over the max length', () => {
    expect(() => SeoDescription.create('a'.repeat(159))).toThrow(SeoDescriptionValidationError);
    try {
      SeoDescription.create('a'.repeat(159));
    } catch (err) {
      expect((err as SeoDescriptionValidationError).code).toBe(SeoErrorCode.DESCRIPTION_TOO_LONG);
    }
  });

  it('reconstitute skips validation', () => {
    expect(SeoDescription.reconstitute('a'.repeat(159)).value).toBe('a'.repeat(159));
  });
});
