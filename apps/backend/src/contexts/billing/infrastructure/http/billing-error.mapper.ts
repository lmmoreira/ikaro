import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { BillingErrorCode } from '@ikaro/types';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { ChargeConcurrentModificationError } from '../../domain/errors/charge-concurrent-modification.error';
import { IllegalChargeTransitionError } from '../../domain/errors/illegal-charge-transition.error';
import {
  FakeScenarioNotApplicableError,
  ProviderNotSupportedError,
} from '../../domain/errors/billing-provider.errors';
import { RecoveryChargeAlreadyOpenError } from '../../domain/errors/recovery-charge-already-open.error';
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
  GraceNotAllowedError,
  NoPriceForCountryError,
  PlanEmptyError,
  SignupCountryNotSupportedError,
  SignupTermsNotAcceptedError,
  SimulationNotApplicableError,
  SubscriptionConcurrentModificationError,
  UnsuspendNotAllowedError,
} from '../../domain/errors/billing-domain.error';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';

// The refusals of paying a charge (M26-S15, UC-119) that are not a plain conflict: a charge id the
// tenant does not own reads the same as an unknown one (404); the identity a held recovery charge
// waits for is a refusal of the request (422); a provider that cannot issue a link is a retryable
// 503, whose retry the creation job or the manager's next click will satisfy. `ChargeNotPayableError`
// is a 409 and sits with the other conflicts below. Returns when `err` is none of these.
function mapPaymentRefusal(err: unknown): void {
  if (err instanceof ChargeNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message);
  }
  if (err instanceof BillingAddressRequiredError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  if (err instanceof BillingProviderUnavailableError) {
    throw throwProblemDetail(HttpStatus.SERVICE_UNAVAILABLE, err.code, err.message);
  }
  // No adapter serves the merchant profile key yet (a sandbox or live key before its adapter ships):
  // the same retryable answer. The message names the key, so the client gets a fixed one.
  if (err instanceof ProviderNotSupportedError) {
    throw throwProblemDetail(
      HttpStatus.SERVICE_UNAVAILABLE,
      BillingErrorCode.PROVIDER_UNAVAILABLE,
      'The billing provider is unavailable',
    );
  }
}

// The billing identity save (M26-S16, UC-118): a tax id or an email the billing country refuses is a
// refusal of the request (422); a tenant with no billing account yet (the provisioning window) is a
// retryable 503. The address errors keep the shared mapper's 400. Returns when `err` is none of these.
function mapIdentityRefusal(err: unknown): void {
  if (
    err instanceof BillingIdentityTaxIdInvalidError ||
    err instanceof BillingIdentityEmailInvalidError
  ) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  if (err instanceof BillingProvisioningError) {
    throw throwProblemDetail(HttpStatus.SERVICE_UNAVAILABLE, err.code, err.message);
  }
}

// Billing's domain-error-to-HTTP mapper (M25-S06). Today it only handles the shared VO errors the
// Billing aggregates construct (CountryCode, CalendarDate, TaxId, ...). Billing's own domain errors
// are added by the story that first gives them an HTTP surface (S15b mapped the operator refusals,
// S16 the identity save); until then the unmapped ones stay on the error-mapper-coverage
// exceptions in architecture-policy.json.
export function mapBillingError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  mapIdentityRefusal(err);
  // SIGNUP_TERMS_NOT_ACCEPTED: a business refusal, 422 per docs/API_CONTRACTS.md (M25-S09).
  // SIGNUP_COUNTRY_NOT_SUPPORTED (M26-S24, UC-127 A7): the same kind of refusal, 422.
  if (err instanceof SignupTermsNotAcceptedError || err instanceof SignupCountryNotSupportedError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  // A proposed plan selection that is not valid (UC-136 A1, A5, A6): the request is well formed but
  // the plan rules refuse it, 422 each.
  if (
    err instanceof FeatureDependencyUnmetError ||
    err instanceof FeatureHasDependentsError ||
    err instanceof PlanEmptyError ||
    err instanceof NoPriceForCountryError
  ) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  // An unknown tenant id on the access lookup: 404 with Platform's TENANT_NOT_FOUND (M25-S13).
  if (err instanceof BillingTenantNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message);
  }
  mapPaymentRefusal(err);
  // Operator refusals (M25-S15b, UC-111 / UC-137): the exempt protection is a 403, the two state
  // conflicts are 409s.
  if (err instanceof ExemptProtectedError) {
    throw throwProblemDetail(HttpStatus.FORBIDDEN, err.code, err.message);
  }
  // The optimistic version check lost a race behind B-R1 (or a writer that skipped it): the client
  // reloads and retries, like the other contexts' CONCURRENT_MODIFICATION codes.
  if (
    err instanceof GraceNotAllowedError ||
    err instanceof UnsuspendNotAllowedError ||
    // A charge that was cancelled, refunded or charged back cannot be paid any more (UC-119 A5).
    err instanceof ChargeNotPayableError ||
    err instanceof SubscriptionConcurrentModificationError ||
    // The Charge errors (M26-S02) are internal: the two "already" ones are consumed by the use
    // cases, and none has a client code of its own, so they answer the same generic conflict.
    err instanceof IllegalChargeTransitionError ||
    err instanceof ChargeConcurrentModificationError ||
    err instanceof ChargeAlreadyExistsError ||
    err instanceof RecoveryChargeAlreadyOpenError ||
    // Dev `simulate`: the event does not apply, so nothing was delivered.
    err instanceof SimulationNotApplicableError ||
    err instanceof FakeScenarioNotApplicableError
  ) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
