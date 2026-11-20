import type { NewChargeInput } from './charge.types';
import { ChargeInvariantError } from './errors/billing-domain.error';

/**
 * The shape rules of a new charge, checked once at creation: at least one line, every line in the
 * charge's currency, and period dates that match the kind (a `PERIOD` charge has both, a
 * `RECOVERY` charge has neither: its period lives on the subscription).
 */
export function assertChargeShape(input: NewChargeInput): void {
  if (input.lines.length === 0) {
    throw new ChargeInvariantError('A charge needs at least one line');
  }
  if (input.lines.some((line) => line.unitPrice.currency !== input.currency)) {
    throw new ChargeInvariantError(`Every line must be priced in ${input.currency}`);
  }
  const hasPeriod = input.periodStart !== null && input.periodEnd !== null;
  const hasNoPeriod = input.periodStart === null && input.periodEnd === null;
  if (input.kind === 'PERIOD' && !hasPeriod) {
    throw new ChargeInvariantError('A PERIOD charge needs both period dates');
  }
  if (input.kind === 'RECOVERY' && !hasNoPeriod) {
    throw new ChargeInvariantError('A RECOVERY charge has no period dates');
  }
}
