import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { SuspensionReason, SubscriptionStatus } from '../../domain/subscription.types';
import type { ISubscriptionRepository } from '../ports/subscription-repository.port';

/** What every operator write answers with: the subscription state after the action. */
export interface OperatorBillingStateResult {
  status: SubscriptionStatus;
  suspensionReason: SuspensionReason | null;
  exempt: boolean;
  /** ISO-8601 UTC, or `null` when no grace is set. */
  graceUntil: string | null;
}

export function toOperatorBillingState(subscription: Subscription): OperatorBillingStateResult {
  return {
    status: subscription.status,
    suspensionReason: subscription.suspensionReason,
    exempt: subscription.exempt,
    graceUntil: subscription.graceUntil?.toISOString() ?? null,
  };
}

/**
 * Lock B-R1: the subscription row, locked, inside the caller's `txManager.run()`. A tenant with no
 * subscription answers the same typed `404` as an unknown tenant id (never a silent no-op).
 */
export async function loadSubscriptionForUpdate(
  subscriptions: ISubscriptionRepository,
  tenantId: string,
): Promise<Subscription> {
  const subscription = await subscriptions.findByTenantIdForUpdate(tenantId);
  if (subscription === null) throw new BillingTenantNotFoundError(tenantId);
  return subscription;
}
