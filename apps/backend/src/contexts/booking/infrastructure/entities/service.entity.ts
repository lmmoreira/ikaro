import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  ServiceApprovalMode,
  ServiceBookingModel,
  ServiceDurationPolicy,
  ServicePricingPolicy,
} from '../../domain/service.aggregate';

@Entity('services', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'isActive'])
@Index(['tenantId', 'bookingModel'])
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

  @Column({ name: 'booking_model', type: 'varchar', length: 20, default: 'APPOINTMENT' })
  bookingModel!: ServiceBookingModel;

  @Column({ name: 'buffer_after_minutes', type: 'int', nullable: true })
  bufferAfterMinutes!: number | null;

  // M22-S02 — booking-policy fields (UC-055), all null on a SESSION service. See
  // docs/13-DATABASE_SCHEMA.md § booking.services — modified (M22 Cluster 2).
  @Column({ name: 'default_approval_mode', type: 'varchar', length: 20, nullable: true })
  defaultApprovalMode!: ServiceApprovalMode | null;

  @Column({ name: 'manual_hold_minutes', type: 'int', nullable: true })
  manualHoldMinutes!: number | null;

  @Column({ name: 'cancellation_window_hours_override', type: 'int', nullable: true })
  cancellationWindowHoursOverride!: number | null;

  @Column({ name: 'reschedule_window_hours_override', type: 'int', nullable: true })
  rescheduleWindowHoursOverride!: number | null;

  @Column({ name: 'min_booking_advance_hours_override', type: 'int', nullable: true })
  minBookingAdvanceHoursOverride!: number | null;

  @Column({ name: 'max_booking_advance_days_override', type: 'int', nullable: true })
  maxBookingAdvanceDaysOverride!: number | null;

  @Column({ name: 'recurrence_eligible', type: 'boolean', default: false })
  recurrenceEligible!: boolean;

  @Column({ name: 'availability_alert_eligible', type: 'boolean', default: false })
  availabilityAlertEligible!: boolean;

  @Column({ name: 'duration_policy', type: 'varchar', length: 20, default: 'FIXED' })
  durationPolicy!: ServiceDurationPolicy;

  @Column({ name: 'duration_min_minutes', type: 'int', nullable: true })
  durationMinMinutes!: number | null;

  @Column({ name: 'duration_max_minutes', type: 'int', nullable: true })
  durationMaxMinutes!: number | null;

  @Column({ name: 'duration_increment_minutes', type: 'int', nullable: true })
  durationIncrementMinutes!: number | null;

  @Column({ name: 'pricing_policy', type: 'varchar', length: 20, default: 'FIXED' })
  pricingPolicy!: ServicePricingPolicy;

  @Column({ name: 'pricing_increment_minutes', type: 'int', nullable: true })
  pricingIncrementMinutes!: number | null;

  @Column({
    name: 'price_per_increment_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pricePerIncrementAmount!: string | null;

  @Column({
    name: 'minimum_charge_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  minimumChargeAmount!: string | null;
}
