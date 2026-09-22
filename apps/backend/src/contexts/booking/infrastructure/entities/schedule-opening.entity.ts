import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// Real uniqueness lives in the migration only — two partial unique indexes
// (WHERE resource_id IS NULL / WHERE resource_id IS NOT NULL) replace the old plain
// UNIQUE(tenant_id, date), which TypeORM's @Unique decorator cannot express (no WHERE
// clause support). Matches ResourceEntity's existing precedent for its own partial
// unique indexes (migration-only, undeclared on the entity class).
@Entity('schedule_openings', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'resourceId', 'date'])
export class ScheduleOpeningEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'date' })
  date!: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime!: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime!: string;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
