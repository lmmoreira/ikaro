import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';

// Billing's domain-error-to-HTTP mapper (M25-S06). Today it only handles the shared VO errors the
// Billing aggregates construct (CountryCode, CalendarDate, TaxId, ...). Billing's own domain errors
// are added by the story that first gives them an HTTP surface (S08, S15b, S16, M26); until then
// the S04 errors stay on the error-mapper-coverage exceptions in architecture-policy.json.
export function mapBillingError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
