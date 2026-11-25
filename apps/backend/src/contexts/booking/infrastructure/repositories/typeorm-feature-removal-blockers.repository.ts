import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { IFeatureRemovalBlockersRepository } from '../../application/ports/feature-removal-blockers-repository.port';
import type {
  BookingRemovalBlocker,
  FeatureRemovalBlockerPage,
  ScheduleRemovalBlocker,
} from '../../application/ports/feature-removal-blockers.types';
import { BookingStatus } from '../../domain/booking.aggregate';

// The bookings the guard counts: still live and ending after one instant. One instant is compared,
// never a per-row local date, so the query starts from the (tenant_id, status) index and needs no
// new one. An occurrence of a PENDING_APPROVAL / ACTIVE schedule is excluded, because the schedule
// is counted once on its own: its occurrences would otherwise inflate its count by its length. The
// exact total comes from the same statement (`COUNT(*) OVER ()`), so the sample and the count can
// never disagree. Exported so the integration spec can EXPLAIN the very statement that runs.
export const FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL = `
  SELECT b.id, b.scheduled_end_at, COUNT(*) OVER () AS total
  FROM booking.bookings b
  WHERE b.tenant_id = $1
    AND b.status = ANY($2::text[])
    AND b.scheduled_end_at > $3
    AND NOT (
      b.recurring_schedule_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM booking.recurring_booking_schedules s
        WHERE s.tenant_id = b.tenant_id
          AND s.id = b.recurring_schedule_id
          AND s.status = ANY($4::text[])
      )
    )
  ORDER BY b.scheduled_end_at ASC, b.id ASC
  LIMIT $5
`;

export const FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL = `
  SELECT s.id, to_char(s.ends_on, 'YYYY-MM-DD') AS ends_on, COUNT(*) OVER () AS total
  FROM booking.recurring_booking_schedules s
  WHERE s.tenant_id = $1
    AND s.status = ANY($2::text[])
    AND s.ends_on >= $3::date
  ORDER BY s.ends_on ASC, s.id ASC
  LIMIT $4
`;

const LIVE_BOOKING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.INFO_REQUESTED,
  BookingStatus.APPROVED,
];
const COUNTED_SCHEDULE_STATUSES = ['PENDING_APPROVAL', 'ACTIVE'];

// Raw SQL on purpose: two tenant-scoped reads of ids and dates, no aggregate loaded.
@Injectable()
export class TypeOrmFeatureRemovalBlockersRepository implements IFeatureRemovalBlockersRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findBookingsEndingAfter(
    tenantId: string,
    endsAfter: Date,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<BookingRemovalBlocker>> {
    const rows: Array<{ id: string; scheduled_end_at: Date; total: string }> =
      await this.dataSource.query(FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL, [
        tenantId,
        LIVE_BOOKING_STATUSES,
        endsAfter,
        COUNTED_SCHEDULE_STATUSES,
        sampleLimit,
      ]);
    return {
      total: rows.length === 0 ? 0 : Number(rows[0].total),
      sample: rows.map((row) => ({ id: row.id, scheduledEndAt: row.scheduled_end_at })),
    };
  }

  async findSchedulesEndingOnOrAfter(
    tenantId: string,
    effectiveDate: string,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<ScheduleRemovalBlocker>> {
    const rows: Array<{ id: string; ends_on: string; total: string }> = await this.dataSource.query(
      FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL,
      [tenantId, COUNTED_SCHEDULE_STATUSES, effectiveDate, sampleLimit],
    );
    return {
      total: rows.length === 0 ? 0 : Number(rows[0].total),
      sample: rows.map((row) => ({ id: row.id, endsOn: row.ends_on })),
    };
  }
}
