import type { IFeatureRemovalBlockersRepository } from '../../../contexts/booking/application/ports/feature-removal-blockers-repository.port';
import type {
  BookingRemovalBlocker,
  FeatureRemovalBlockerPage,
  ScheduleRemovalBlocker,
} from '../../../contexts/booking/application/ports/feature-removal-blockers.types';

interface SeededBooking {
  tenantId: string;
  id: string;
  status: string;
  scheduledEndAt: Date;
  recurringScheduleId?: string | null;
}

interface SeededSchedule {
  tenantId: string;
  id: string;
  status: string;
  endsOn: string;
}

const LIVE_BOOKING_STATUSES = new Set(['PENDING', 'INFO_REQUESTED', 'APPROVED']);
const COUNTED_SCHEDULE_STATUSES = new Set(['PENDING_APPROVAL', 'ACTIVE']);

// Applies the same rules as TypeOrmFeatureRemovalBlockersRepository over seeded rows, so a use case
// spec exercises them without a database; the real statements are pinned by the integration spec.
export class InMemoryFeatureRemovalBlockersRepository implements IFeatureRemovalBlockersRepository {
  private readonly bookings: SeededBooking[] = [];
  private readonly schedules: SeededSchedule[] = [];

  seedBooking(booking: SeededBooking): void {
    this.bookings.push(booking);
  }

  seedSchedule(schedule: SeededSchedule): void {
    this.schedules.push(schedule);
  }

  findBookingsEndingAfter(
    tenantId: string,
    endsAfter: Date,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<BookingRemovalBlocker>> {
    const countedScheduleIds = new Set(
      this.schedules
        .filter((s) => s.tenantId === tenantId && COUNTED_SCHEDULE_STATUSES.has(s.status))
        .map((s) => s.id),
    );
    const blockers = this.bookings
      .filter((b) => b.tenantId === tenantId && LIVE_BOOKING_STATUSES.has(b.status))
      .filter((b) => b.scheduledEndAt.getTime() > endsAfter.getTime())
      .filter((b) => !(b.recurringScheduleId && countedScheduleIds.has(b.recurringScheduleId)))
      .map((b) => ({ id: b.id, scheduledEndAt: b.scheduledEndAt }))
      .sort(
        (a, b) =>
          a.scheduledEndAt.getTime() - b.scheduledEndAt.getTime() || a.id.localeCompare(b.id),
      );
    return Promise.resolve({ total: blockers.length, sample: blockers.slice(0, sampleLimit) });
  }

  findSchedulesEndingOnOrAfter(
    tenantId: string,
    effectiveDate: string,
    sampleLimit: number,
  ): Promise<FeatureRemovalBlockerPage<ScheduleRemovalBlocker>> {
    const blockers = this.schedules
      .filter(
        (s) =>
          s.tenantId === tenantId &&
          COUNTED_SCHEDULE_STATUSES.has(s.status) &&
          s.endsOn >= effectiveDate,
      )
      .map((s) => ({ id: s.id, endsOn: s.endsOn }))
      .sort((a, b) => a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id));
    return Promise.resolve({ total: blockers.length, sample: blockers.slice(0, sampleLimit) });
  }

  clear(): void {
    this.bookings.length = 0;
    this.schedules.length = 0;
  }
}
