import { BillingErrorCode } from '@ikaro/types/protocol/errors';
import type { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { BillingDomainError } from './billing-domain.error';

/**
 * `UQ_billing_charges_period`: the period already has a non-cancelled charge. The calling use case
 * catches it and re-reads the existing charge ("return the existing one"); it is never a client code.
 */
export class ChargeAlreadyExistsError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.CONCURRENT_MODIFICATION;

  constructor() {
    super('The period already has a charge');
    this.name = 'ChargeAlreadyExistsError';
  }
}
