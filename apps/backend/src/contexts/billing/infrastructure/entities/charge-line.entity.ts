import { Column, Entity, PrimaryColumn } from 'typeorm';

// The price snapshot of one feature of a charge, written once with the charge and never changed.
// The composite FK (tenant_id, charge_id) blocks a line pointing at another tenant's charge.
@Entity('charge_lines', { schema: 'billing' })
export class ChargeLineEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'charge_id', type: 'uuid' })
  chargeId!: string;

  @Column({ name: 'feature_key', type: 'varchar', length: 20 })
  featureKey!: string;

  @Column({ type: 'varchar', length: 20 })
  tier!: string;

  @Column({ name: 'unit_price_minor', type: 'bigint' })
  unitPriceMinor!: string;
}
