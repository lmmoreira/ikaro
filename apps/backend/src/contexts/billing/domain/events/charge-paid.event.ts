import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { PaymentMethod } from '../provider-events';

interface ChargePaidData extends Record<string, unknown> {
  chargeId: string;
  amountMinor: number;
  currency: string;
  method: PaymentMethod;
  /** ISO-8601 UTC. */
  paidAt: string;
  /** The provider's receipt link (from the re-read); `null` when the provider gave none. */
  receiptUrl: string | null;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
}

/** The first provider-verified paid signal for a charge (docs/DOMAIN_EVENTS.md § ChargePaid). */
export class ChargePaid extends DomainEvent<ChargePaidData> {
  readonly eventVersion = 1;
  readonly data: ChargePaidData;

  constructor(tenantId: string, correlationId: string, data: ChargePaidData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
