import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';

@Entity('notification_templates', { schema: 'notification' })
@Index('IDX_notification_templates_tenant_id', ['tenantId'])
export class NotificationTemplateEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'trigger_event', type: 'varchar', length: 100 })
  triggerEvent!: NotificationTemplateKey;

  @Column({ type: 'varchar', length: 20, default: 'EMAIL' })
  channel!: string;

  @Column({ type: 'varchar', length: 10, default: 'pt-BR' })
  locale!: string;

  @Column({ type: 'varchar', length: 255 })
  subject!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
