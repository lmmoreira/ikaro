import { BillingErrorCode } from '@ikaro/types/protocol/errors';
import type { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { BillingDomainError } from './billing-domain.error';

/**
 * `UQ_billing_charges_open_recovery`: the subscription already has an open (`PENDING` / `OVERDUE`)
 * recovery charge. The calling use case catches it and re-reads that charge; never a client code.
 */
export class RecoveryChargeAlreadyOpenError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.CONCURRENT_MODIFICATION;

  constructor() {
    super('The subscription already has an open recovery charge');
    this.name = 'RecoveryChargeAlreadyOpenError';
  }
}
