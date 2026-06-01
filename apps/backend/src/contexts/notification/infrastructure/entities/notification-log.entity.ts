import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('notification_logs', { schema: 'notification' })
@Index('IDX_notification_logs_tenant_id', ['tenantId'])
@Index('IDX_notification_logs_tenant_status', ['tenantId', 'status'])
@Index('IDX_notification_logs_tenant_recipient', ['tenantId', 'recipientEmail'])
export class NotificationLogEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'notification_type', type: 'varchar', length: 100 })
  notificationType!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail!: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: string;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
