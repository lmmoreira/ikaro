import { GenericErrorCode } from '@ikaro/types';
import { BillingErrorCode, PlatformErrorCode, SignupErrorCode } from '@ikaro/types/protocol/errors';
import type { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';

// Billing domain errors (M25-S04). Plain typed classes: the Billing HTTP error mapper and the
// BillingErrorCode catalog arrive with M25-S06 (which maps these), so nothing here reaches HTTP yet.
export class BillingDomainError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype); // required — instanceof fails without this
    this.name = 'BillingDomainError';
  }
}

/** No price row, or no version in force at the asked date — never answered with a zero price. */
export class FeaturePriceNotFoundError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'FeaturePriceNotFoundError';
  }
}

/** A FeaturePrice invariant was broken (tier/feature, cycle, currency/country, version order). */
export class FeaturePriceInvariantError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'FeaturePriceInvariantError';
  }
}

/** A MinorAmount was built from a fractional, negative or unsafe amount or a non-ISO currency. */
export class MinorAmountValidationError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'MinorAmountValidationError';
  }
}

// Subscription / BillingAccount invariant errors. The plan refusals (M26-S17) carry their wire code
// and are mapped to HTTP; the others are domain-only until an endpoint can throw them (a wire code
// is additive-only once shipped), so each stays on its error-mapper-coverage exception.

/** A feature in the proposed selection needs another that is neither selected nor in the current plan. */
export class FeatureDependencyUnmetError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.FEATURE_DEPENDENCY_UNMET;
  constructor(
    readonly featureKey: string,
    readonly requiredFeatureKey: string,
  ) {
    super(`${featureKey} requires ${requiredFeatureKey}, which is not in the selection`);
    this.name = 'FeatureDependencyUnmetError';
  }
}

/** The selection removes a feature that another selected feature still depends on. */
export class FeatureHasDependentsError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.FEATURE_HAS_DEPENDENTS;
  constructor(
    readonly featureKey: string,
    readonly dependentFeatureKey: string,
  ) {
    super(`${featureKey} cannot be removed while ${dependentFeatureKey} depends on it`);
    this.name = 'FeatureHasDependentsError';
  }
}

/** A plan always keeps at least one feature. */
export class PlanEmptyError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.PLAN_EMPTY;
  constructor() {
    super('A plan must keep at least one feature');
    this.name = 'PlanEmptyError';
  }
}

/** A selected tier has no selectable list price in force for the tenant's country on the date it is priced. */
export class NoPriceForCountryError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.NO_PRICE_FOR_COUNTRY;
  constructor(
    readonly featureKey: string,
    readonly tier: string,
  ) {
    super(`No price is available for ${featureKey} ${tier} in the tenant's country`);
    this.name = 'NoPriceForCountryError';
  }
}

/** An exempt subscription is never suspended, and the platform-owner tenant's is never un-exempted. */
export class ExemptProtectedError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.EXEMPT_PROTECTED;

  constructor(message: string) {
    super(message);
    this.name = 'ExemptProtectedError';
  }
}

/** Grace is refused unless the subscription is PAST_DUE, and it never shortens the 14 days. */
export class GraceNotAllowedError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.GRACE_NOT_ALLOWED;

  constructor(message: string) {
    super(message);
    this.name = 'GraceNotAllowedError';
  }
}

/** Only an OPERATOR suspension is lifted by the operator; a payment-based one needs a payment. */
export class UnsuspendNotAllowedError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.UNSUSPEND_NOT_ALLOWED;

  constructor(message: string) {
    super(message);
    this.name = 'UnsuspendNotAllowedError';
  }
}

/** A Subscription invariant other than the named ones was broken (tier/feature, item overlap, shape). */
export class SubscriptionInvariantError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'SubscriptionInvariantError';
  }
}

/** A Charge or ChargeLine was built from an inconsistent shape (kind/period dates, lines, amounts). */
export class ChargeInvariantError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'ChargeInvariantError';
  }
}

/** The optimistic `version` check found the row changed since it was read. */
export class SubscriptionConcurrentModificationError
  extends BillingDomainError
  implements DomainErrorShape
{
  readonly code = BillingErrorCode.CONCURRENT_MODIFICATION;

  constructor() {
    super('The subscription was modified concurrently; reload it and retry');
    this.name = 'SubscriptionConcurrentModificationError';
  }
}

/** `UNIQUE(tenant_id)`: a second subscription for one tenant. */
export class SubscriptionAlreadyExistsError extends BillingDomainError {
  constructor() {
    super('The tenant already has a subscription');
    this.name = 'SubscriptionAlreadyExistsError';
  }
}

/** A tax id whose type the billing country does not accept (a BR account given an EIN or OTHER, ...). */
export class BillingAccountTaxIdNotAllowedError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'BillingAccountTaxIdNotAllowedError';
  }
}

/** `UNIQUE(tenant_id)`: a second billing account for one tenant. */
export class BillingAccountAlreadyExistsError extends BillingDomainError {
  constructor() {
    super('The tenant already has a billing account');
    this.name = 'BillingAccountAlreadyExistsError';
  }
}

/** A billing account whose tenant has no subscription row — its country cannot be resolved. */
export class BillingAccountSubscriptionMissingError extends BillingDomainError {
  constructor() {
    super('The billing account has no subscription to take its country from');
    this.name = 'BillingAccountSubscriptionMissingError';
  }
}

/**
 * The registration a provisioned tenant names is unknown, or already `COMPLETED` for another
 * tenant (UC-110 A8). Raised to the `TenantProvisioned` handler, never to a route.
 */
export class SignupRegistrationNotAvailableError extends BillingDomainError {
  constructor(registrationId: string) {
    super(`Signup registration ${registrationId} is unknown or already completed`);
    this.name = 'SignupRegistrationNotAvailableError';
  }
}

/** A `SELF_SIGNUP` registration was reserved without the accepted terms (`422`, M25-S09). */
export class SignupTermsNotAcceptedError extends BillingDomainError implements DomainErrorShape {
  readonly code = SignupErrorCode.TERMS_NOT_ACCEPTED;

  constructor() {
    super('The Terms of Use must be accepted to sign up');
    this.name = 'SignupTermsNotAcceptedError';
  }
}

/**
 * A `SELF_SIGNUP` registration named a country outside `SIGNUP_SUPPORTED_COUNTRIES` (`422`,
 * M26-S24, UC-127 A7). The page offers only supported countries, so this is a tampered or stale
 * request, and the code lets the web tell "not offered" from a malformed country code.
 */
export class SignupCountryNotSupportedError extends BillingDomainError implements DomainErrorShape {
  readonly code = SignupErrorCode.COUNTRY_NOT_SUPPORTED;

  constructor(countryCode: string) {
    super(`Signup is not available for country ${countryCode}`);
    this.name = 'SignupCountryNotSupportedError';
  }
}

/**
 * The tenant an access lookup names does not exist (`404`, M25-S13). It deliberately reuses
 * Platform's `TENANT_NOT_FOUND` code, so Billing adds no wire code and no locale entry; it must
 * never be mistaken for a transient lookup error, which fails open.
 */
export class BillingTenantNotFoundError extends BillingDomainError implements DomainErrorShape {
  readonly code = PlatformErrorCode.TENANT_NOT_FOUND;

  constructor(tenantId: string) {
    super(`Tenant '${tenantId}' not found`);
    this.name = 'BillingTenantNotFoundError';
  }
}

/**
 * An `OperatorAudit` record was built with an empty or over-long actor, an empty reason, or an
 * oversize payload (M25-S15a). The operator routes validate the reason at the request boundary, so
 * this is a defence-in-depth error no endpoint surfaces.
 */
export class OperatorAuditInvariantError extends BillingDomainError {
  constructor(message: string) {
    super(message);
    this.name = 'OperatorAuditInvariantError';
  }
}

export type SimulationRefusal =
  | 'CHARGE_NOT_FOUND'
  | 'NO_MATCHING_CHARGE'
  | 'AMBIGUOUS_CHARGE'
  | 'NOT_FAKE_PROFILE'
  | 'NO_PROVIDER_CHARGE'
  | 'CHARGE_STATE'
  | 'UNKNOWN_TO_FAKE';

/**
 * Dev `simulate` (UC-138) cannot play the event: no charge matches, the charge is not in a state the
 * event applies to, its profile is not a `*_FAKE` one, or the fake does not know it (a restarted or
 * second instance). A `409` that delivers nothing. It reuses the generic `VALUE_INVALID` code: a
 * dev-only route earns no catalogue or locale entry of its own.
 */
export class SimulationNotApplicableError extends BillingDomainError implements DomainErrorShape {
  readonly code = GenericErrorCode.VALUE_INVALID;

  constructor(
    readonly refusal: SimulationRefusal,
    message: string,
  ) {
    super(message);
    this.name = 'SimulationNotApplicableError';
  }
}
