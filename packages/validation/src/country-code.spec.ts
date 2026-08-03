import { COUNTRY_CODE_FORMAT_PATTERN } from './country-code';

describe('COUNTRY_CODE_FORMAT_PATTERN', () => {
  it('accepts a 2-letter uppercase code', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('BR')).toBe(true);
  });

  it('accepts a 2-letter lowercase code', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('br')).toBe(true);
  });

  it('rejects a 3-letter code', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('BRA')).toBe(false);
  });

  it('rejects a 1-letter code', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('B')).toBe(false);
  });

  it('rejects a code with digits', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('B1')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(COUNTRY_CODE_FORMAT_PATTERN.test('')).toBe(false);
  });
});
