import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { PaymentMethod } from '../provider-events';
import type { MinorAmount } from '../value-objects/minor-amount.vo';

interface ChargePaidData extends Record<string, unknown> {
  chargeId: string;
  amountMinor: number;
  currency: string;
  /** `null` only when the provider reported no method for a paid charge. */
  method: PaymentMethod | null;
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

  /** The event for a charge that was just paid; the aggregate passes itself, structurally. */
  static forCharge(
    charge: { readonly tenantId: string; readonly id: string; readonly amount: MinorAmount },
    correlationId: string,
    method: PaymentMethod | null,
    paidAt: Date,
    receiptUrl: string | null,
    recipientEmail: string | null,
  ): ChargePaid {
    return new ChargePaid(charge.tenantId, correlationId, {
      chargeId: charge.id,
      amountMinor: charge.amount.amountMinor,
      currency: charge.amount.currency,
      method,
      paidAt: paidAt.toISOString(),
      receiptUrl,
      recipientEmail,
    });
  }
}
