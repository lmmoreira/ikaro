import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('inbox', { schema: 'shared' })
export class InboxRecordEntity {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @PrimaryColumn({ name: 'consumer_name', type: 'varchar', length: 150 })
  consumerName!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', update: false })
  processedAt!: Date;
}
