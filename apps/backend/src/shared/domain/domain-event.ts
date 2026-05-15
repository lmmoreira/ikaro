import { uuidv7 } from './uuid-v7';

export abstract class DomainEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly eventId: string;
  readonly tenantId: string;
  readonly occurredAt: string;
  readonly correlationId: string;
  abstract readonly eventName: string;
  abstract readonly eventVersion: number;
  abstract readonly data: TData;

  protected constructor(tenantId: string, correlationId: string) {
    this.eventId = uuidv7();
    this.tenantId = tenantId;
    this.occurredAt = new Date().toISOString();
    this.correlationId = correlationId;
  }
}
