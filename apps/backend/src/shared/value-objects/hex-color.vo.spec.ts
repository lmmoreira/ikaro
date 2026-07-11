import { HexColorErrorCode } from '@ikaro/types';
import { HexColor, HexColorValidationError } from './hex-color.vo';

describe('HexColor', () => {
  it('accepts valid hex colors', () => {
    expect(HexColor.isValid('#FF5733')).toBe(true);
    expect(HexColor.isValid('#0055a4')).toBe(true);
    expect(HexColor.isValid('#000000')).toBe(true);
    expect(HexColor.isValid('#FFFFFF')).toBe(true);
  });

  it('rejects missing hash', () => {
    expect(HexColor.isValid('FF5733')).toBe(false);
  });

  it('rejects short hex', () => {
    expect(HexColor.isValid('#FFF')).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(HexColor.isValid('#GGGGGG')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(HexColor.isValid('')).toBe(false);
  });

  it('create normalises to uppercase', () => {
    const c = HexColor.create('#ff5733');
    expect(c.value).toBe('#FF5733');
  });

  it('create throws HexColorValidationError with FORMAT_INVALID for an invalid value', () => {
    expect(() => HexColor.create('not-a-color')).toThrow(HexColorValidationError);
    try {
      HexColor.create('not-a-color');
    } catch (err) {
      expect((err as HexColorValidationError).code).toBe(HexColorErrorCode.FORMAT_INVALID);
    }
  });

  it('reconstitute normalises to uppercase without validation', () => {
    expect(HexColor.reconstitute('#eff6ff').value).toBe('#EFF6FF');
    expect(HexColor.reconstitute('#2563EB').value).toBe('#2563EB');
  });
});
