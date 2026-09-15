import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ServiceIntakeQuestion } from '../../domain/service-booking-intake-schema';

// docs/13-DATABASE_SCHEMA.md § booking.service_booking_intake_schema (M22-S02) — a versioned,
// service-owned booking-intake definition; a new version supersedes, never edits, the previous
// one (UC-054).
@Entity('service_booking_intake_schema', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'serviceId'])
export class ServiceBookingIntakeSchemaEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'jsonb' })
  questions!: ServiceIntakeQuestion[];

  @Column({ name: 'consent_text', type: 'text' })
  consentText!: string;

  @Column({ name: 'consent_version', type: 'int' })
  consentVersion!: number;

  @Column({ name: 'requires_named_attendees', type: 'boolean', default: false })
  requiresNamedAttendees!: boolean;

  @Column({ name: 'participant_count_required', type: 'boolean', default: false })
  participantCountRequired!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
