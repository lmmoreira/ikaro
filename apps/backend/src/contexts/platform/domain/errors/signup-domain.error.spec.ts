import { SignupErrorCode } from '@ikaro/types';
import {
  SignupSlugInvalidError,
  SignupSlugTakenError,
  SignupTurnstileFailedError,
} from './signup-domain.error';

describe('signup domain errors', () => {
  it('SignupSlugTakenError carries SIGNUP_SLUG_TAKEN and the slug field', () => {
    const error = new SignupSlugTakenError('lavacar-top');

    expect(error).toBeInstanceOf(SignupSlugTakenError);
    expect(error).toMatchObject({ code: SignupErrorCode.SLUG_TAKEN, field: 'slug' });
    expect(error.message).toContain('lavacar-top');
  });

  it('SignupSlugInvalidError carries SIGNUP_SLUG_INVALID, the slug field and the reason', () => {
    const error = new SignupSlugInvalidError('ab', 'TOO_SHORT');

    expect(error).toBeInstanceOf(SignupSlugInvalidError);
    expect(error).toMatchObject({
      code: SignupErrorCode.SLUG_INVALID,
      field: 'slug',
      reason: 'TOO_SHORT',
    });
  });

  it('SignupTurnstileFailedError carries SIGNUP_TURNSTILE_FAILED and no field', () => {
    const error = new SignupTurnstileFailedError();

    expect(error).toBeInstanceOf(SignupTurnstileFailedError);
    expect(error.code).toBe(SignupErrorCode.TURNSTILE_FAILED);
    expect('field' in error).toBe(false);
  });

  // `instanceof` is how every mapXxxError branch recognises them: it must survive the prototype
  // chain of an Error subclass.
  it('each is an Error whose instanceof check holds after construction', () => {
    for (const error of [
      new SignupSlugTakenError('x'),
      new SignupSlugInvalidError('x', 'TOO_SHORT'),
      new SignupTurnstileFailedError(),
    ]) {
      expect(error).toBeInstanceOf(Error);
      expect(Object.getPrototypeOf(error)).toBe(error.constructor.prototype);
    }
  });
});
