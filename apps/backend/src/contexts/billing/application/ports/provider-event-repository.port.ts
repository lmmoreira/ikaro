import type { BillingProvider } from '../../domain/billing-account.aggregate';
import type { ProviderEvent } from '../../domain/provider-event';

export const PROVIDER_EVENT_REPOSITORY = Symbol('IProviderEventRepository');

/** The webhook idempotency inbox (`billing.provider_events`). */
export interface IProviderEventRepository {
  /**
   * `INSERT … ON CONFLICT (provider, event_id) DO NOTHING`. Returns `true` when this call
   * inserted the row and `false` when the event was already there: a replayed webhook becomes a
   * no-op without an exception, even under concurrency. Joins the caller's transaction, so the row
   * commits (or rolls back) with the local change and the outbox rows.
   */
  insertIfAbsent(event: ProviderEvent): Promise<boolean>;

  /**
   * A cheap read-only check by `(provider, eventId)`, run before the provider re-read so a replayed
   * delivery costs no provider call (the provider's rate limit). Not the dedupe itself:
   * `insertIfAbsent` inside the transaction stays authoritative.
   */
  exists(provider: BillingProvider, eventId: string): Promise<boolean>;

  /**
   * Whether the provider has a processed webhook delivery received strictly after `since` (UC-140:
   * a real processed delivery after the webhook re-enable is what closes the alert, never a cleared
   * flag). Served by `IDX_billing_provider_events_received_at`.
   */
  existsProcessedAfter(provider: BillingProvider, since: Date): Promise<boolean>;

  /**
   * Deletes up to `limit` rows received strictly before `cutoff`, oldest first, and returns how
   * many it deleted (UC-114 retention). Cross-tenant by design: the inbox is purged globally, and
   * a row carries no payload. Served by `IDX_billing_provider_events_received_at`. Runs in no
   * transaction of its own: each call is one short statement, and a rerun is safe.
   */
  deleteOlderThanBatch(cutoff: Date, limit: number): Promise<number>;
}
