import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import {
  FutureCommitmentAlternative,
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionResolutionType,
  FutureCommitmentExceptionSourceType,
  FutureCommitmentExceptionStatus,
} from '../../domain/future-commitment-exception.types';

// docs/13-DATABASE_SCHEMA.md § booking.future_commitment_exceptions (M23 Cluster 3). The partial
// unique index on the still-OPEN impact is created by the migration (TypeORM's @Index can't
// express its WHERE clause here) — it is what makes a repeated raise update instead of duplicate.
@Entity('future_commitment_exceptions', { schema: 'booking' })
@Index(['tenantId', 'affectedType', 'affectedId'])
@Index(['tenantId', 'ownerStaffId', 'status'])
export class FutureCommitmentExceptionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'source_type', type: 'varchar', length: 30 })
  sourceType!: FutureCommitmentExceptionSourceType;

  @Column({ name: 'source_id', type: 'uuid' })
  sourceId!: string;

  @Column({ name: 'affected_type', type: 'varchar', length: 20 })
  affectedType!: FutureCommitmentExceptionAffectedType;

  @Column({ name: 'affected_id', type: 'uuid' })
  affectedId!: string;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status!: FutureCommitmentExceptionStatus;

  @Column({ name: 'owner_staff_id', type: 'uuid', nullable: true })
  ownerStaffId!: string | null;

  @Column({ name: 'resolution_type', type: 'varchar', length: 20, nullable: true })
  resolutionType!: FutureCommitmentExceptionResolutionType | null;

  @Column({ name: 'resolution_reason', type: 'text', nullable: true })
  resolutionReason!: string | null;

  @Column({ name: 'resolved_by_staff_id', type: 'uuid', nullable: true })
  resolvedByStaffId!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'notification_outcome', type: 'varchar', length: 30, nullable: true })
  notificationOutcome!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  alternatives!: FutureCommitmentAlternative[];

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
