import { uuidv7 } from './uuid-v7';

// Shared wire envelope for anything published over IEventBus — both DomainEvent (a fact that
// already happened, emitted at most once per business action) and Command (an idempotent
// instruction that a scheduled job may legitimately construct more than once for the same
// underlying business fact, e.g. a retried or overlapping cron tick — see command.ts). Kept as
// the common base rather than duplicating this envelope in each so the transport layer
// (IEventBus, GcpPubSubEventBusAdapter, the outbox) only ever needs one shared type.
export abstract class Envelope<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventId: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  // Derived from the concrete subclass name (e.g. `StaffInvited`) rather than a hand-typed
  // literal — keeps handlers' subscribe<T>(T.name, ...) calls in sync with the class by
  // construction instead of by convention. Safe: the backend build (swc, no minification)
  // never renames classes.
  readonly eventName: string;
  abstract readonly eventVersion: number;
  abstract readonly data: TData;
  // Not readonly, unlike the rest of this envelope: set by OutboxPublisher.publish() right
  // before the outbox insert (TD28), after this instance already exists — capturing it here
  // instead of in this constructor keeps aggregate methods (domain layer, zero framework deps)
  // from ever depending on ITracingPort. Rides into shared.outbox's jsonb payload column for
  // free (no migration) since insert() JSON.stringify()s the whole envelope verbatim.
  traceContext?: Record<string, string>;

  protected constructor(tenantId: string, correlationId: string) {
    this.eventId = uuidv7();
    this.tenantId = tenantId;
    this.occurredAt = new Date().toISOString();
    this.correlationId = correlationId;
    this.eventName = this.constructor.name;
  }
}
