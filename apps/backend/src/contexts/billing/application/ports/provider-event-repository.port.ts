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
}
