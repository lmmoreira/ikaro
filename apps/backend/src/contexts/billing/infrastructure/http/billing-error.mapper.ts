import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { SignupTermsNotAcceptedError } from '../../domain/errors/billing-domain.error';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';

// Billing's domain-error-to-HTTP mapper (M25-S06). Today it only handles the shared VO errors the
// Billing aggregates construct (CountryCode, CalendarDate, TaxId, ...). Billing's own domain errors
// are added by the story that first gives them an HTTP surface (S08, S15b, S16, M26); until then
// the S04 errors stay on the error-mapper-coverage exceptions in architecture-policy.json.
export function mapBillingError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  // SIGNUP_TERMS_NOT_ACCEPTED: a business refusal, 422 per docs/API_CONTRACTS.md (M25-S09).
  if (err instanceof SignupTermsNotAcceptedError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
