import { uuidv7 } from './uuid-v7';

export abstract class DomainEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventId: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  // Derived from the concrete subclass name (e.g. `StaffInvited`) rather than a hand-typed
  // literal — keeps handlers' subscribe<T>(T.name, ...) calls in sync with the class by
  // construction instead of by convention. Safe: the backend build (swc, no minification)
  // never renames classes.
  readonly eventName: string;
  // Set only by cron-published events (TD24-S03) that need a deterministic business key for
  // outbox dedup instead of the per-publication eventId. undefined for every aggregate-driven
  // event — the outbox falls back to eventId. Serializes into the envelope like any other field;
  // consumers ignore it.
  readonly dedupKey?: string;
  abstract readonly eventVersion: number;
  abstract readonly data: TData;

  protected constructor(tenantId: string, correlationId: string) {
    this.eventId = uuidv7();
    this.tenantId = tenantId;
    this.occurredAt = new Date().toISOString();
    this.correlationId = correlationId;
    this.eventName = this.constructor.name;
  }
}
