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
  BillingAddressRequiredError,
  BillingIdentityEmailInvalidError,
  BillingIdentityTaxIdInvalidError,
  BillingProviderUnavailableError,
  BillingProvisioningError,
  BillingTenantNotFoundError,
  ChargeNotFoundError,
  ChargeNotPayableError,
  ExemptProtectedError,
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  FeaturePriceNotFoundError,
  GraceNotAllowedError,
  NoPriceForCountryError,
  PlanEmptyError,
  SignupTermsNotAcceptedError,
  SubscriptionConcurrentModificationError,
  UnsuspendNotAllowedError,
} from '../../domain/errors/billing-domain.error';
import {
  MerchantProfileKeyNotAllowedError,
  ProviderNotSupportedError,
} from '../../domain/errors/billing-provider.errors';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { ChargeConcurrentModificationError } from '../../domain/errors/charge-concurrent-modification.error';
import { IllegalChargeTransitionError } from '../../domain/errors/illegal-charge-transition.error';
import { RecoveryChargeAlreadyOpenError } from '../../domain/errors/recovery-charge-already-open.error';
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

  it.each([
    [
      new FeatureDependencyUnmetError('LOYALTY', 'BOOKING'),
      BillingErrorCode.FEATURE_DEPENDENCY_UNMET,
    ],
    [new FeatureHasDependentsError('BOOKING', 'LOYALTY'), BillingErrorCode.FEATURE_HAS_DEPENDENTS],
    [new PlanEmptyError(), BillingErrorCode.PLAN_EMPTY],
    [new NoPriceForCountryError('CHATBOT', 'PLUS'), BillingErrorCode.NO_PRICE_FOR_COUNTRY],
  ])('maps the plan refusal %p to 422 with its code (UC-136 A1, A5, A6)', (error, code) => {
    const thrown = call(error) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code });
  });

  // Paying a charge (M26-S15, UC-119): the four codes the two payment routes answer.
  it.each([
    [
      'a charge the tenant does not own',
      new ChargeNotFoundError('c-1'),
      HttpStatus.NOT_FOUND,
      BillingErrorCode.CHARGE_NOT_FOUND,
    ],
    [
      'a charge that can no longer be paid',
      new ChargeNotPayableError('c-1', 'CANCELED'),
      HttpStatus.CONFLICT,
      BillingErrorCode.CHARGE_NOT_PAYABLE,
    ],
    [
      'a charge held for the billing address',
      new BillingAddressRequiredError(),
      HttpStatus.UNPROCESSABLE_ENTITY,
      BillingErrorCode.ADDRESS_REQUIRED,
    ],
    [
      'a provider that cannot issue a link',
      new BillingProviderUnavailableError('UNAVAILABLE'),
      HttpStatus.SERVICE_UNAVAILABLE,
      BillingErrorCode.PROVIDER_UNAVAILABLE,
    ],
    [
      'a tax id the billing country refuses (UC-118 A1)',
      new BillingIdentityTaxIdInvalidError('not a valid CPF or CNPJ'),
      HttpStatus.UNPROCESSABLE_ENTITY,
      BillingErrorCode.IDENTITY_TAX_ID_INVALID,
    ],
    [
      'an invalid billing email (UC-118 A2)',
      new BillingIdentityEmailInvalidError('not an email'),
      HttpStatus.UNPROCESSABLE_ENTITY,
      BillingErrorCode.IDENTITY_EMAIL_INVALID,
    ],
    [
      'the provisioning window, with no billing account to save onto',
      new BillingProvisioningError(),
      HttpStatus.SERVICE_UNAVAILABLE,
      BillingErrorCode.PROVISIONING,
    ],
  ])('maps %s to its status and code', (_name, error, status, code) => {
    const thrown = call(error) as HttpException;
    expect(thrown.getStatus()).toBe(status);
    expect(thrown.getResponse()).toMatchObject({ code });
  });

  it('maps a merchant profile with no adapter to the same retryable 503, without naming the key', () => {
    const thrown = call(
      new ProviderNotSupportedError('merchant profile key BRL_ASAAS_SANDBOX'),
    ) as HttpException;
    expect(thrown.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(thrown.getResponse()).toMatchObject({ code: BillingErrorCode.PROVIDER_UNAVAILABLE });
    expect(JSON.stringify(thrown.getResponse())).not.toContain('BRL_ASAAS_SANDBOX');
  });

  it('keeps a key not allowed in this environment a loud error, never a 503', () => {
    const err = new MerchantProfileKeyNotAllowedError('BRL_FAKE', 'production');
    expect(call(err)).toBe(err);
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

  it.each([
    ['IllegalChargeTransitionError', new IllegalChargeTransitionError('PAID', 'be cancelled')],
    ['ChargeConcurrentModificationError', new ChargeConcurrentModificationError()],
    ['ChargeAlreadyExistsError', new ChargeAlreadyExistsError()],
    ['RecoveryChargeAlreadyOpenError', new RecoveryChargeAlreadyOpenError()],
  ])(
    'maps %s to the generic 409 BILLING_CONCURRENT_MODIFICATION (no code of its own)',
    (_n, err) => {
      const thrown = call(err) as HttpException;
      expect(thrown.getStatus()).toBe(HttpStatus.CONFLICT);
      expect(thrown.getResponse()).toMatchObject({
        code: BillingErrorCode.CONCURRENT_MODIFICATION,
      });
    },
  );

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
