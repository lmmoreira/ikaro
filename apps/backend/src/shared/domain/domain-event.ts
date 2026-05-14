import { randomBytes } from 'crypto';

function uuidv7(): string {
  const bytes = randomBytes(16);
  const now = BigInt(Date.now());
  // Embed 48-bit unix timestamp ms in the first 6 bytes
  bytes[0] = Number((now >> 40n) & 0xffn);
  bytes[1] = Number((now >> 32n) & 0xffn);
  bytes[2] = Number((now >> 24n) & 0xffn);
  bytes[3] = Number((now >> 16n) & 0xffn);
  bytes[4] = Number((now >> 8n) & 0xffn);
  bytes[5] = Number(now & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

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
