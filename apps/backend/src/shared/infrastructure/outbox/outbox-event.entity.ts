import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('outbox', { schema: 'shared' })
export class OutboxEventEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'dedup_key', type: 'varchar', length: 255, unique: true })
  dedupKey!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'event_name', type: 'varchar', length: 100 })
  eventName!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}
