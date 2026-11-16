import { Column, Entity, PrimaryColumn } from 'typeorm';

// The expiry sweep's watermark, one row per job (keyed by name, like
// platform.chatbot_provider_balance is keyed by provider). No tenant_id: the sweep is system-wide.
@Entity('expiry_sweep_state', { schema: 'loyalty' })
export class ExpirySweepStateEntity {
  @PrimaryColumn({ name: 'job_name', type: 'varchar', length: 64 })
  jobName!: string;

  @Column({ name: 'processed_through', type: 'timestamptz' })
  processedThrough!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
