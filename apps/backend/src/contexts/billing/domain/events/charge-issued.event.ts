import { DomainEvent } from '../../../../shared/domain/domain-event';
import type { ChargeKind } from '../charge.types';

interface ChargeIssuedData extends Record<string, unknown> {
  chargeId: string;
  kind: ChargeKind;
  /** The tenant-local calendar date, `YYYY-MM-DD`. */
  dueDate: string;
  amountMinor: number;
  currency: string;
  /** The provider's hosted payment link: the invoice email needs it and Notification reads only event data. */
  paymentUrl: string;
  /** The billing email, resolved by Billing at publish time; `null` falls back to the managers. */
  recipientEmail: string | null;
}

/**
 * A charge exists at the provider and can be paid (`provider_creation_status = READY`); published
 * only after the provider call succeeded (docs/DOMAIN_EVENTS.md § ChargeIssued).
 */
export class ChargeIssued extends DomainEvent<ChargeIssuedData> {
  readonly eventVersion = 1;
  readonly data: ChargeIssuedData;

  constructor(tenantId: string, correlationId: string, data: ChargeIssuedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
