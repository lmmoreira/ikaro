import { DateTime } from 'luxon';
import type { CreateProviderChargeInput } from '../../application/ports/billing-provider.port';
import { ProviderRequestError } from '../../domain/errors/billing-provider.errors';

const MINIMUM_CHARGE_MINOR = 500;
const MAX_EXTERNAL_REFERENCE_LENGTH = 100;

function assertValidAmount(lines: CreateProviderChargeInput['lines']): void {
  const everyLineIsPositive = lines.every(
    (line) => Number.isInteger(line.amountMinor) && line.amountMinor > 0,
  );
  const total = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (!everyLineIsPositive || total < MINIMUM_CHARGE_MINOR) {
    throw new ProviderRequestError('INVALID_AMOUNT');
  }
}

function assertValidDueDate(dueDate: string, today: string): void {
  const isCalendarDay = DateTime.fromFormat(dueDate, 'yyyy-MM-dd', { zone: 'utc' }).isValid;
  if (!isCalendarDay || dueDate < today) throw new ProviderRequestError('INVALID_DUE_DATE');
}

/**
 * The checks Asaas makes when a charge is created (docs/ASAAS_PROVIDER.md § 2): the customer's tax
 * id, the external reference length, BRL only, the R$ 5 minimum and a due date that is a real
 * calendar day not before `today` (the São Paulo day). They apply to a new charge only; a retry of
 * an existing reference is returned as it is.
 */
export function assertValidNewCharge(
  input: CreateProviderChargeInput,
  customerTaxId: string | null | undefined,
  today: string,
): void {
  if (!customerTaxId) throw new ProviderRequestError('TAX_ID_REQUIRED');
  const reference = input.externalReference;
  if (reference === '' || reference.length > MAX_EXTERNAL_REFERENCE_LENGTH) {
    throw new ProviderRequestError('INVALID_REFERENCE');
  }
  if (input.currency !== 'BRL') throw new ProviderRequestError('INVALID_CURRENCY');
  if (!/^[A-Z]{2}$/.test(input.customerLocation.countryCode)) {
    throw new ProviderRequestError('INVALID_LOCATION');
  }
  assertValidAmount(input.lines);
  assertValidDueDate(input.dueDate, today);
}
