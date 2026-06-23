import { Column, Entity, Index, PrimaryColumn, VersionColumn } from 'typeorm';

@Entity('bookings', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'customerId'])
@Index(['tenantId', 'scheduledAt'])
export class BookingEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'contact_email', type: 'varchar', length: 255 })
  contactEmail!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255 })
  contactName!: string;

  @Column({ name: 'contact_phone', type: 'varchar', length: 30 })
  contactPhone!: string;

  @Column({ name: 'contact_address', type: 'jsonb', nullable: true })
  contactAddress!: Record<string, unknown> | null;

  @Column({ name: 'pickup_address', type: 'jsonb', nullable: true })
  pickupAddress!: Record<string, unknown> | null;

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt!: Date;

  @Column({ name: 'total_duration_mins', type: 'int' })
  totalDurationMins!: number;

  @Column({ name: 'total_price_amount', type: 'numeric', precision: 10, scale: 2 })
  totalPriceAmount!: string;

  @Column({
    name: 'total_actual_price_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  totalActualPriceAmount!: string | null;

  @Column({ name: 'before_service_photo_urls', type: 'text', array: true })
  beforeServicePhotoUrls!: string[];

  @Column({ name: 'after_service_photo_urls', type: 'text', array: true })
  afterServicePhotoUrls!: string[];

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes!: string | null;

  @Column({ name: 'info_request_message', type: 'text', nullable: true })
  infoRequestMessage!: string | null;

  @Column({ name: 'info_requested_at', type: 'timestamptz', nullable: true })
  infoRequestedAt!: Date | null;

  @Column({ name: 'info_requested_by', type: 'uuid', nullable: true })
  infoRequestedBy!: string | null;

  @Column({ name: 'info_response_message', type: 'text', nullable: true })
  infoResponseMessage!: string | null;

  @Column({ name: 'info_submitted_at', type: 'timestamptz', nullable: true })
  infoSubmittedAt!: Date | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @VersionColumn({ name: 'version', default: 1 })
  version!: number;
}
