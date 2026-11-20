import type { Charge } from '../../domain/charge.aggregate';
import { IllegalChargeTransitionError } from '../../domain/errors/illegal-charge-transition.error';
import type { PaymentMethod } from '../../domain/provider-events';
import type { Subscription } from '../../domain/subscription.aggregate';

/** A provider-verified fact about one charge: the only input `ApplyChargeFactService` takes. */
export type ChargeFact =
  | {
      readonly type: 'PAID';
      readonly method: PaymentMethod | null;
      readonly paidAt: Date;
      readonly receiptUrl: string | null;
    }
  | { readonly type: 'REFUNDED' }
  | { readonly type: 'CHARGEBACK' };

export interface ChargeFactContext {
  readonly now: Date;
  readonly correlationId: string;
  readonly recipientEmail: string | null;
}

export type ChargeFactResult = 'APPLIED' | 'NO_CHANGE' | 'ILLEGAL';

/** What the pure transition did, so the use case knows what to save and which follow-up applies. */
export interface ChargeFactOutcome {
  readonly result: ChargeFactResult;
  readonly chargeChanged: boolean;
  readonly subscriptionChanged: boolean;
  /** A `PERIOD` payment ended a payment suspension: the open `RECOVERY` charge is no longer needed. */
  readonly staleRecoveryPaid: boolean;
  /** A reversal suspended the tenant: a `RECOVERY` charge must exist. */
  readonly suspendedByReversal: boolean;
  /** A `RECOVERY` charge was paid for a tenant the stale charge had already reactivated. */
  readonly doublePaid: boolean;
}

const NO_CHANGE: ChargeFactOutcome = {
  result: 'NO_CHANGE',
  chargeChanged: false,
  subscriptionChanged: false,
  staleRecoveryPaid: false,
  suspendedByReversal: false,
  doublePaid: false,
};

const ILLEGAL: ChargeFactOutcome = { ...NO_CHANGE, result: 'ILLEGAL' };

/** A payment suspension a payment lifts: not an operator one, and the tenant is not exempt. */
function paymentSuspended(subscription: Subscription): boolean {
  return (
    subscription.status === 'SUSPENDED' &&
    subscription.suspensionReason !== 'OPERATOR' &&
    !subscription.exempt
  );
}

// The stale charge was the payment and already reactivated the tenant: a second payment buys
// nothing, so it is recorded `REFUNDED` (the actual refund is made in the provider console).
function applyRecoveryPaid(
  charge: Charge,
  subscription: Subscription,
  fact: Extract<ChargeFact, { type: 'PAID' }>,
  ctx: ChargeFactContext,
): ChargeFactOutcome {
  const doublePaid = subscription.status !== 'SUSPENDED' && !subscription.exempt;
  if (doublePaid) charge.markRefunded(charge.amount);
  const changed = subscription.reactivateOnPayment(
    fact.paidAt,
    ctx.now,
    ctx.correlationId,
    ctx.recipientEmail,
  );
  return {
    ...NO_CHANGE,
    result: 'APPLIED',
    chargeChanged: true,
    subscriptionChanged: changed,
    doublePaid,
  };
}

function applyPeriodPaid(
  charge: Charge,
  subscription: Subscription,
  ctx: ChargeFactContext,
): ChargeFactOutcome {
  // The period moved on (a recovery payment began a newer month): this payment buys nothing, so it
  // is recorded `REFUNDED` and the subscription's period is left alone.
  if (subscription.hasMovedPast(charge.periodStart!)) {
    charge.markRefunded(charge.amount);
    return { ...NO_CHANGE, result: 'APPLIED', chargeChanged: true, doublePaid: true };
  }
  const wasPaymentSuspended = paymentSuspended(subscription);
  const changed = subscription.markPeriodPaid(
    charge.periodStart!,
    charge.periodEnd!,
    ctx.now,
    ctx.correlationId,
    ctx.recipientEmail,
  );
  return {
    ...NO_CHANGE,
    result: 'APPLIED',
    chargeChanged: true,
    subscriptionChanged: changed,
    staleRecoveryPaid: wasPaymentSuspended && subscription.status !== 'SUSPENDED',
  };
}

function applyPaid(
  charge: Charge,
  subscription: Subscription,
  fact: Extract<ChargeFact, { type: 'PAID' }>,
  ctx: ChargeFactContext,
): ChargeFactOutcome {
  if (charge.status === 'PAID') return NO_CHANGE;
  charge.markPaid(fact.method, fact.paidAt, fact.receiptUrl, ctx.correlationId, ctx.recipientEmail);
  return charge.kind === 'RECOVERY'
    ? applyRecoveryPaid(charge, subscription, fact, ctx)
    : applyPeriodPaid(charge, subscription, ctx);
}

function applyReversal(
  charge: Charge,
  subscription: Subscription,
  fact: Exclude<ChargeFact, { type: 'PAID' }>,
  ctx: ChargeFactContext,
): ChargeFactOutcome {
  const before = charge.status;
  if (fact.type === 'REFUNDED') charge.markRefunded(charge.amount);
  else charge.markChargeback();
  if (charge.status === before) return NO_CHANGE;
  const suspendedByReversal = subscription.reversePayment(
    {
      kind: charge.kind,
      periodStart: charge.periodStart,
      periodEnd: charge.periodEnd,
      paidAt: charge.paidAt,
    },
    ctx.now,
    ctx.correlationId,
    ctx.recipientEmail,
  );
  return {
    ...NO_CHANGE,
    result: 'APPLIED',
    chargeChanged: true,
    subscriptionChanged: suspendedByReversal,
    suspendedByReversal,
  };
}

/**
 * The paid / refunded / charged-back transitions of one charge and the subscription change they
 * cause (UC-114), pure: it never saves and never reads a clock. An illegal transition (a paid fact
 * for a refunded charge, a refund of an unpaid one) is not thrown: it is `ILLEGAL`, logged by the
 * caller and left to reconcile (S07).
 */
export function applyChargeFact(
  charge: Charge,
  subscription: Subscription,
  fact: ChargeFact,
  ctx: ChargeFactContext,
): ChargeFactOutcome {
  try {
    return fact.type === 'PAID'
      ? applyPaid(charge, subscription, fact, ctx)
      : applyReversal(charge, subscription, fact, ctx);
  } catch (err) {
    if (err instanceof IllegalChargeTransitionError) return ILLEGAL;
    throw err;
  }
}
