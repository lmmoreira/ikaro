import { Column, Entity, PrimaryColumn } from 'typeorm';

// pg returns a BIGINT as a string; every price this platform sells is far below
// Number.MAX_SAFE_INTEGER minor units, and MinorAmount rejects an unsafe integer on write.
const bigintAsNumber = {
  to: (value: number): number => value,
  from: (value: string | null): number | null => (value === null ? null : Number(value)),
};

// No tenant_id column — the same documented exemption as FeaturePriceEntity. A version in effect
// is immutable history; a not-yet-effective one is superseded (superseded_at set), never deleted.
@Entity('feature_price_versions', { schema: 'billing' })
export class FeaturePriceVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'feature_price_id', type: 'uuid' })
  featurePriceId!: string;

  @Column({ name: 'amount_minor', type: 'bigint', transformer: bigintAsNumber })
  amountMinor!: number;

  // DATE comes back as 'YYYY-MM-DD' (TypeORM's `date` column type), never a Date.
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom!: string;

  @Column({ name: 'announced_at', type: 'timestamptz', nullable: true })
  announcedAt!: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 100 })
  createdBy!: string;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ name: 'superseded_at', type: 'timestamptz', nullable: true })
  supersededAt!: Date | null;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;
}
