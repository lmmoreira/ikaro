import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';

@Entity('schedule_closures', { schema: 'booking' })
@Index(['tenantId'])
@Index(['tenantId', 'date'])
@Index(['tenantId', 'resourceId', 'date'])
export class ScheduleClosureEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId!: string | null;

  @Column({ type: 'date' })
  date!: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime!: string | null;

  @Column({ type: 'varchar', length: 50 })
  reason!: ClosureReason;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'created_at', type: 'timestamptz', update: false })
  createdAt!: Date;
}
