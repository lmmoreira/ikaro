import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

@Entity('loyalty_entries', { schema: 'loyalty' })
@Index('IDX_loyalty_entries_tenant_id', ['tenantId'])
@Index('IDX_loyalty_entries_tenant_customer', ['tenantId', 'customerId'])
@Index('IDX_loyalty_entries_tenant_customer_expires', ['tenantId', 'customerId', 'expiresAt'])
@Unique('UQ_loyalty_entries_tenant_booking_line', ['tenantId', 'bookingLineId'])
export class LoyaltyEntryEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId!: string;

  @Column({ name: 'booking_line_id', type: 'uuid' })
  bookingLineId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ type: 'int' })
  points!: number;

  @Column({ name: 'earned_at', type: 'timestamptz' })
  earnedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
