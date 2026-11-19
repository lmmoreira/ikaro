import type { BillingAccount } from '../../domain/billing-account.aggregate';

/**
 * The one place a Billing event's `recipientEmail` is decided (docs/DOMAIN_EVENTS.md § Billing
 * Context Events): the account's billing email when set, otherwise `null` (Notification then falls
 * back to the tenant's managers). An exempt subscription is never emailed about billing, so it
 * resolves to `null` whatever the account holds.
 */
export function resolveBillingRecipientEmail(
  exempt: boolean,
  account: Pick<BillingAccount, 'billingEmail'> | null,
): string | null {
  if (exempt) return null;
  return account?.billingEmail?.address ?? null;
}
