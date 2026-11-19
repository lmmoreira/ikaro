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
}
