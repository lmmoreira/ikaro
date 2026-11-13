import { HttpException, HttpStatus } from '@nestjs/common';
import {
  BillingErrorCode,
  CountryCodeErrorCode,
  PlatformErrorCode,
  SignupErrorCode,
} from '@ikaro/types';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { TaxIdValidationError } from '../../../../shared/value-objects/tax-id.vo';
import {
  BillingTenantNotFoundError,
  ExemptProtectedError,
  FeaturePriceNotFoundError,
  GraceNotAllowedError,
  SignupTermsNotAcceptedError,
  SubscriptionConcurrentModificationError,
  UnsuspendNotAllowedError,
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

  it('maps BillingTenantNotFoundError to 404 with Platform TENANT_NOT_FOUND', () => {
    const thrown = call(new BillingTenantNotFoundError('t-1')) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(thrown.getResponse()).toMatchObject({ code: PlatformErrorCode.TENANT_NOT_FOUND });
  });

  it('maps ExemptProtectedError to 403 BILLING_EXEMPT_PROTECTED (UC-111 A3)', () => {
    const thrown = call(new ExemptProtectedError('exempt')) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(thrown.getResponse()).toMatchObject({ code: BillingErrorCode.EXEMPT_PROTECTED });
  });

  it('maps GraceNotAllowedError to 409 BILLING_GRACE_NOT_ALLOWED (UC-111 A1)', () => {
    const thrown = call(new GraceNotAllowedError('not past due')) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(thrown.getResponse()).toMatchObject({ code: BillingErrorCode.GRACE_NOT_ALLOWED });
  });

  it('maps UnsuspendNotAllowedError to 409 BILLING_UNSUSPEND_NOT_ALLOWED (UC-111 A2)', () => {
    const thrown = call(new UnsuspendNotAllowedError('payment based')) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(thrown.getResponse()).toMatchObject({ code: BillingErrorCode.UNSUSPEND_NOT_ALLOWED });
  });

  it('maps SubscriptionConcurrentModificationError to a retryable 409 BILLING_CONCURRENT_MODIFICATION', () => {
    const thrown = call(new SubscriptionConcurrentModificationError()) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(thrown.getResponse()).toMatchObject({ code: BillingErrorCode.CONCURRENT_MODIFICATION });
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
