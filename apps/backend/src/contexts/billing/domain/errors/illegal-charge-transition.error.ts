import { BillingErrorCode } from '@ikaro/types/protocol/errors';
import type { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { BillingDomainError } from './billing-domain.error';

/**
 * A `Charge` method was called from a status the transition table does not allow it from
 * (docs/DOMAIN_MODEL.md § Aggregate: Charge). Internal: it never reaches a client as a code of its
 * own, the Billing mapper answers `409` with the existing concurrent-modification code.
 */
export class IllegalChargeTransitionError extends BillingDomainError implements DomainErrorShape {
  readonly code = BillingErrorCode.CONCURRENT_MODIFICATION;

  constructor(
    readonly from: string,
    readonly action: string,
  ) {
    super(`A ${from} charge cannot ${action}`);
    this.name = 'IllegalChargeTransitionError';
  }
}
