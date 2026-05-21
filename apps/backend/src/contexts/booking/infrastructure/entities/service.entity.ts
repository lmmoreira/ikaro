import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('services', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'isActive'])
export class ServiceEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'price_amount', type: 'numeric', precision: 10, scale: 2 })
  priceAmount!: string;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes!: number;

  @Column({ name: 'loyalty_points_value', type: 'int', default: 0 })
  loyaltyPointsValue!: number;

  @Column({ name: 'requires_pickup_address', type: 'boolean', default: false })
  requiresPickupAddress!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
