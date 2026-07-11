import { Envelope } from './envelope';

// An idempotent instruction — "send this reminder," "warn this customer" — not a fact about
// something that already happened to an aggregate (contrast with DomainEvent). Only ever
// constructed by scheduled jobs, never by aggregate methods. A retried or overlapping cron tick
// can legitimately construct the *same* Command twice with two different eventIds (DomainEvent's
// constructor mints a fresh one every time), so a Command carries its own deterministic dedupKey
// — required, not optional — identifying the underlying business fact independent of eventId.
// The outbox's UNIQUE(dedup_key) + ON CONFLICT DO NOTHING is what collapses N such construction
// attempts into a single delivered message (TD24-S01/S03).
export abstract class Command<
  TData extends Record<string, unknown> = Record<string, unknown>,
> extends Envelope<TData> {
  readonly dedupKey: string;

  protected constructor(tenantId: string, correlationId: string, dedupKey: string) {
    super(tenantId, correlationId);
    this.dedupKey = dedupKey;
  }
}
