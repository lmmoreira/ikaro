import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events', { schema: 'loyalty' })
export class ProcessedEventEntity {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @PrimaryColumn({ name: 'consumer_name', type: 'varchar' })
  consumerName!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
