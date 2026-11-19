import { Column, Entity, PrimaryColumn } from 'typeorm';

// The webhook idempotency inbox. The primary key is (provider, event_id), not tenant-first: the
// event id is the provider's and the tenant is resolved from the provider customer before the
// insert (the documented tenant-first exemption). No payload column: the body is never stored.
@Entity('provider_events', { schema: 'billing' })
export class ProviderEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 10 })
  provider!: string;

  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 100 })
  eventId!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType!: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz' })
  processedAt!: Date;
}
