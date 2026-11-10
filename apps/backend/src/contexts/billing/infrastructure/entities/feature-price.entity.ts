import { Column, Entity, PrimaryColumn } from 'typeorm';

// No tenant_id column — deliberate exemption, not an oversight. The price list is one global list
// for every tenant (Ikaro's own catalog), not tenant business data; see
// docs/TENANT_ISOLATION_STRATEGY.md and docs/DATABASE_SCHEMA.md § `billing.feature_prices`.
// The amount lives in feature_price_versions: a price change is a new dated row, never an edit here.
@Entity('feature_prices', { schema: 'billing' })
export class FeaturePriceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'feature_key', type: 'varchar', length: 20 })
  featureKey!: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @Column({ type: 'varchar', length: 20, default: 'STANDARD' })
  tier!: string;

  @Column({ type: 'varchar', length: 10, default: 'MONTHLY' })
  cycle!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ type: 'boolean', default: true })
  selectable!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', insert: false, update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', insert: false, update: false })
  updatedAt!: Date;
}
