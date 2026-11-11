import { HttpException, HttpStatus } from '@nestjs/common';
import { CountryCodeErrorCode, SignupErrorCode } from '@ikaro/types';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { TaxIdValidationError } from '../../../../shared/value-objects/tax-id.vo';
import {
  FeaturePriceNotFoundError,
  SignupTermsNotAcceptedError,
} from '../../domain/errors/billing-domain.error';
import { mapBillingError } from './billing-error.mapper';

function call(err: unknown): unknown {
  try {
    mapBillingError(err);
  } catch (thrown) {
    return thrown;
  }
  throw new Error('mapBillingError should have thrown');
}

describe('mapBillingError', () => {
  it('maps a TaxIdValidationError to 422 with its signup code', () => {
    const thrown = call(
      new TaxIdValidationError('bad tax id', SignupErrorCode.TAX_ID_INVALID),
    ) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.TAX_ID_INVALID });
  });

  it('maps SignupTermsNotAcceptedError to 422 SIGNUP_TERMS_NOT_ACCEPTED', () => {
    const thrown = call(new SignupTermsNotAcceptedError()) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.TERMS_NOT_ACCEPTED });
  });

  it('maps a CountryCodeValidationError to 400 (shared address branch)', () => {
    const thrown = call(
      new CountryCodeValidationError('bad', CountryCodeErrorCode.UNSUPPORTED),
    ) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rethrows an unmapped error unchanged', () => {
    const err = new FeaturePriceNotFoundError('no price');
    expect(call(err)).toBe(err);
  });

  it('wraps a non-Error throwable', () => {
    expect(call('boom')).toEqual(new Error('Unexpected error: boom'));
  });
});
