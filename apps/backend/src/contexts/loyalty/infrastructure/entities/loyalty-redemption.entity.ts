import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('loyalty_redemptions', { schema: 'loyalty' })
@Index('IDX_loyalty_redemptions_tenant_customer', ['tenantId', 'customerId'])
export class LoyaltyRedemptionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'points_redeemed', type: 'int' })
  pointsRedeemed!: number;

  @Column({ name: 'redeemed_by', type: 'uuid' })
  redeemedBy!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'booking_id', type: 'uuid', nullable: true })
  bookingId!: string | null;

  @Column({ name: 'redeemed_at', type: 'timestamptz' })
  redeemedAt!: Date;
}
