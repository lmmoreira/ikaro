import type { BillingProvider } from './billing-account.aggregate';

/**
 * One row of the webhook idempotency inbox, exactly as `billing.provider_events` defines it:
 * the provider's own event id (with the provider, the primary key), the tenant resolved from the
 * provider customer **before** the insert, the event type and the two instants. **No payload**: the
 * body is never stored (it carries the provider's own data), the inbox only remembers that the
 * event was seen. `domain/provider-events.ts` is a different file: the normalised wire types.
 */
export interface ProviderEvent {
  readonly provider: BillingProvider;
  readonly eventId: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly receivedAt: Date;
  /** Set in the same transaction as the local change and the outbox rows. */
  readonly processedAt: Date;
}
