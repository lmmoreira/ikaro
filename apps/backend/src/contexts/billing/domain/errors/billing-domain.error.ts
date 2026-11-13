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

// Subscription / BillingAccount invariant errors. Domain-only: no endpoint can throw them
// yet, so none is mapped to HTTP and none has a BillingErrorCode (a wire code is additive-only once
// shipped). S15b (operator refusals) and M26-S17/S19 (plan refusals) add the code, status and
// locale entries and remove the matching error-mapper-coverage exception.

/** A feature in the proposed selection needs another that is neither selected nor in the current plan. */
export class FeatureDependencyUnmetError extends BillingDomainError {
  constructor(
    readonly featureKey: string,
    readonly requiredFeatureKey: string,
  ) {
    super(`${featureKey} requires ${requiredFeatureKey}, which is not in the selection`);
    this.name = 'FeatureDependencyUnmetError';
  }
}

/** The selection removes a feature that another selected feature still depends on. */
export class FeatureHasDependentsError extends BillingDomainError {
  constructor(
    readonly featureKey: string,
    readonly dependentFeatureKey: string,
  ) {
    super(`${featureKey} cannot be removed while ${dependentFeatureKey} depends on it`);
    this.name = 'FeatureHasDependentsError';
  }
}

/** A plan always keeps at least one feature. */
export class PlanEmptyError extends BillingDomainError {
  constructor() {
    super('A plan must keep at least one feature');
    this.name = 'PlanEmptyError';
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
