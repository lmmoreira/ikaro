import { PhoneErrorCode } from '@ikaro/types';
import { PhoneNumber, PhoneNumberValidationError } from './phone-number.vo';

describe('PhoneNumber', () => {
  it('accepts a valid Brazilian E.164 number', () => {
    expect(PhoneNumber.isValid('+5511912345678')).toBe(true);
  });

  it('accepts a valid US E.164 number', () => {
    expect(PhoneNumber.isValid('+14155552671')).toBe(true);
  });

  it('rejects a number missing the leading +', () => {
    expect(PhoneNumber.isValid('11912345678')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(PhoneNumber.isValid('')).toBe(false);
  });

  it('rejects a number starting with +0', () => {
    expect(PhoneNumber.isValid('+0123456')).toBe(false);
  });

  it('rejects a number that is too short', () => {
    expect(PhoneNumber.isValid('+123456')).toBe(false);
  });

  it('rejects a number that is too long', () => {
    expect(PhoneNumber.isValid('+1234567890123456')).toBe(false);
  });

  it('rejects non-digit characters after the +', () => {
    expect(PhoneNumber.isValid('+55 11 91234-5678')).toBe(false);
  });

  it('create stores the E.164 value as-is', () => {
    const p = PhoneNumber.create('+5511912345678');
    expect(p.value).toBe('+5511912345678');
  });

  it('format returns the E.164 value as-is', () => {
    const p = PhoneNumber.create('+5511912345678');
    expect(p.format()).toBe('+5511912345678');
  });

  it('create throws PhoneNumberValidationError with FORMAT_INVALID for invalid input', () => {
    expect(() => PhoneNumber.create('11912345678')).toThrow(PhoneNumberValidationError);
    try {
      PhoneNumber.create('11912345678');
    } catch (err) {
      expect((err as PhoneNumberValidationError).code).toBe(PhoneErrorCode.FORMAT_INVALID);
    }
  });
});
