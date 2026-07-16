import { isValidPhoneNumber } from './phone';

describe('isValidPhoneNumber', () => {
  it('accepts a valid E.164 number', () => {
    expect(isValidPhoneNumber('+5511912345678')).toBe(true);
  });

  it('rejects a number missing the leading +', () => {
    expect(isValidPhoneNumber('5511912345678')).toBe(false);
  });

  it('rejects a number with a leading zero country code digit', () => {
    expect(isValidPhoneNumber('+0511912345678')).toBe(false);
  });

  it('rejects a number shorter than 7 digits', () => {
    expect(isValidPhoneNumber('+551191')).toBe(false);
  });

  it('rejects a number longer than 15 digits', () => {
    expect(isValidPhoneNumber('+5511912345678901')).toBe(false);
  });

  it('rejects non-numeric characters', () => {
    expect(isValidPhoneNumber('+55119abcd5678')).toBe(false);
  });
});
