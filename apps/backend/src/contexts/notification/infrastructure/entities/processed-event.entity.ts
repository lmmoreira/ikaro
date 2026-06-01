import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('processed_events', { schema: 'notification' })
export class NotificationProcessedEventEntity {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @PrimaryColumn({ name: 'notification_type', type: 'varchar', length: 100 })
  notificationType!: string;

  @PrimaryColumn({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
