import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('balance_expiry_log', { schema: 'loyalty' })
export class BalanceExpiryLogEntity {
  @PrimaryColumn({ name: 'entry_id', type: 'uuid' })
  entryId!: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'now()' })
  processedAt!: Date;
}
