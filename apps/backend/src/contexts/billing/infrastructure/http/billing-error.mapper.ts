import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import {
  BillingTenantNotFoundError,
  ExemptProtectedError,
  GraceNotAllowedError,
  SignupTermsNotAcceptedError,
  SubscriptionConcurrentModificationError,
  UnsuspendNotAllowedError,
} from '../../domain/errors/billing-domain.error';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';

// Billing's domain-error-to-HTTP mapper (M25-S06). Today it only handles the shared VO errors the
// Billing aggregates construct (CountryCode, CalendarDate, TaxId, ...). Billing's own domain errors
// are added by the story that first gives them an HTTP surface (S15b mapped the operator refusals;
// S16 and M26 add the rest); until then the unmapped ones stay on the error-mapper-coverage
// exceptions in architecture-policy.json.
export function mapBillingError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  // SIGNUP_TERMS_NOT_ACCEPTED: a business refusal, 422 per docs/API_CONTRACTS.md (M25-S09).
  if (err instanceof SignupTermsNotAcceptedError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  // An unknown tenant id on the access lookup: 404 with Platform's TENANT_NOT_FOUND (M25-S13).
  if (err instanceof BillingTenantNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message);
  }
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
    err instanceof SubscriptionConcurrentModificationError
  ) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
