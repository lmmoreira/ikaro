import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('cron_run_log', { schema: 'booking' })
export class CronRunLogEntity {
  @PrimaryColumn({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @PrimaryColumn({ name: 'cron_date', type: 'date' })
  cronDate!: string;

  @PrimaryColumn({ name: 'reminder_type', type: 'varchar' })
  reminderType!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
