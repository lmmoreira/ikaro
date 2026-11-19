import { BillingErrorCode } from '@ikaro/types/protocol/errors';
import type { DomainErrorShape } from '../../../../shared/domain/domain-error-shape';
import { BillingDomainError } from './billing-domain.error';

/** The optimistic `version` check found the charge row changed since it was read. */
export class ChargeConcurrentModificationError
  extends BillingDomainError
  implements DomainErrorShape
{
  readonly code = BillingErrorCode.CONCURRENT_MODIFICATION;

  constructor() {
    super('The charge was modified concurrently; reload it and retry');
    this.name = 'ChargeConcurrentModificationError';
  }
}
