import type { NormalizedChargeState, PaymentMethod } from '../../domain/provider-events';

/** The fake's own bookkeeping for one charge; nothing outside the fake reads it. */
export interface FakeCharge {
  readonly id: string;
  readonly customerId: string;
  readonly externalReference: string;
  readonly amountMinor: number;
  readonly dueDate: string;
  readonly paymentUrl: string;
  state: NormalizedChargeState;
  paymentMethod: PaymentMethod | null;
  paidAt: Date | null;
  /** A dispute is open on a charge that is still `PAID`. */
  disputeOpen: boolean;
}

export function receiptUrlOf(charge: FakeCharge): string | null {
  return charge.paidAt ? `${charge.paymentUrl}/receipt` : null;
}

/** One webhook the fake would POST to the app: the raw body plus the headers Asaas sends. */
export interface FakeWebhookDelivery {
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  /** How long a real transport should wait before delivering it; the fake never sleeps. */
  readonly delayMs: number;
}

/** How a batch of queued deliveries misbehaves, as a real at-least-once webhook can. */
export interface DeliveryOptions {
  /** Deliver every webhook twice, with the same event id. */
  readonly duplicate?: boolean;
  /** Deliver in the reverse of the order they were produced in. */
  readonly reverse?: boolean;
  /** Hold every delivery back by this many milliseconds. */
  readonly delayMs?: number;
}

/** `optionsFrom` leaves the first deliveries as they are: only the ones from that index on misbehave. */
export function applyDeliveryOptions(
  deliveries: readonly FakeWebhookDelivery[],
  options: DeliveryOptions,
  optionsFrom = 0,
): FakeWebhookDelivery[] {
  const tail = deliveries.slice(optionsFrom);
  const ordered = options.reverse ? [...tail].reverse() : [...tail];
  const delayed = ordered.map((delivery) => ({ ...delivery, delayMs: options.delayMs ?? 0 }));
  const misbehaving = options.duplicate
    ? delayed.flatMap((delivery) => [delivery, { ...delivery }])
    : delayed;
  return [...deliveries.slice(0, optionsFrom), ...misbehaving];
}
