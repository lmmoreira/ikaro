import { EmailErrorCode } from '@ikaro/types';
import { Email, EmailValidationError } from './email.vo';

describe('Email', () => {
  describe('isValid', () => {
    it('accepts a well-formed email', () => {
      expect(Email.isValid('user@example.com')).toBe(true);
      expect(Email.isValid('admin@lavacar.com.br')).toBe(true);
    });

    it('rejects missing @', () => {
      expect(Email.isValid('no-at-sign')).toBe(false);
    });

    it('rejects @ at the start', () => {
      expect(Email.isValid('@nodomain.com')).toBe(false);
    });

    it('rejects missing domain dot', () => {
      expect(Email.isValid('user@nodot')).toBe(false);
    });

    it('rejects dot at end of domain', () => {
      expect(Email.isValid('user@domain.')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(Email.isValid('')).toBe(false);
    });
  });

  describe('create', () => {
    it('returns an Email for a valid address', () => {
      const email = Email.create('User@Example.COM');
      expect(email.address).toBe('user@example.com');
    });

    it('normalises to lowercase', () => {
      expect(Email.create('ADMIN@LAVACAR.COM.BR').address).toBe('admin@lavacar.com.br');
    });

    it('throws EmailValidationError with FORMAT_INVALID for an invalid address', () => {
      expect(() => Email.create('not-an-email')).toThrow(EmailValidationError);
      try {
        Email.create('not-an-email');
      } catch (err) {
        expect((err as EmailValidationError).code).toBe(EmailErrorCode.FORMAT_INVALID);
      }
    });
  });
});
