import { Column, Entity, PrimaryColumn } from 'typeorm';

// A single fixed row (id = 1): the expiry sweep's watermark. No tenant_id, the sweep is system-wide.
@Entity('expiry_sweep_state', { schema: 'loyalty' })
export class ExpirySweepStateEntity {
  @PrimaryColumn({ type: 'smallint' })
  id!: number;

  @Column({ name: 'processed_through', type: 'timestamptz' })
  processedThrough!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
