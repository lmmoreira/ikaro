import { mapSequentially } from '../../../../shared/utils/sequential';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITransactionManager } from '../../../../shared/ports/transaction-manager.port';
import { IBookingRepository } from '../ports/booking-repository.port';
import { IRecurringBookingScheduleRepository } from '../ports/recurring-booking-schedule-repository.port';
import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';

// One occurrence booking a REASSIGN moved off `fromResourceId` onto `toResourceId`.
export interface ReassignedOccurrence {
  recurringScheduleId: string;
  fromResourceId: string;
  toResourceId: string;
}

export interface ScheduleSyncDeps {
  txManager: ITransactionManager;
  scheduleRepo: IRecurringBookingScheduleRepository;
  bookingRepo: IBookingRepository;
  occupancyRepo: IResourceOccupancyRepository;
  logger: AppLogger;
}

// A FIXED_ASSIGNMENT schedule's assignment row is only the record of what was requested, so it
// follows a manager's REASSIGN only once nothing of the schedule's future is left on the old
// resource — and only when every moved occurrence landed on the same new resource (an AUTO batch
// can scatter one schedule's occurrences; one assignment cannot describe that, so it stays as-is).
// Best-effort and after the reassigns themselves: the bookings are already moved and committed, so a
// failure here is logged, never turned into a failed resolve.
export async function syncRecurringScheduleAssignments(
  deps: ScheduleSyncDeps,
  tenantId: string,
  moved: ReassignedOccurrence[],
): Promise<void> {
  const byKey = new Map<string, ReassignedOccurrence[]>();
  for (const occurrence of moved) {
    const key = `${occurrence.recurringScheduleId}|${occurrence.fromResourceId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), occurrence]);
  }

  await mapSequentially([...byKey.values()], async (group) => {
    const targets = new Set(group.map((o) => o.toResourceId));
    if (targets.size !== 1) return;
    const { recurringScheduleId, fromResourceId } = group[0];
    try {
      await syncOne(deps, tenantId, recurringScheduleId, fromResourceId, [...targets][0]);
    } catch (err) {
      deps.logger.warn(
        `Recurring schedule assignment left unchanged after reassign: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { tenantId, recurringScheduleId },
      );
    }
  });
}

async function syncOne(
  deps: ScheduleSyncDeps,
  tenantId: string,
  recurringScheduleId: string,
  fromResourceId: string,
  toResourceId: string,
): Promise<void> {
  await deps.txManager.run(async () => {
    const schedule = await deps.scheduleRepo.findById(recurringScheduleId, tenantId);
    if (schedule?.status !== 'ACTIVE' || schedule.assignmentPolicy !== 'FIXED_ASSIGNMENT') return;

    const remaining = await deps.bookingRepo.findFutureActiveByRecurringSchedule(
      tenantId,
      recurringScheduleId,
      new Date(),
    );
    const lineIds = remaining.flatMap((b) => b.lines.map((l) => l.lineId));
    const assignments = await deps.occupancyRepo.findAssignmentsByBookingLines(tenantId, lineIds);
    // Every future occurrence must now sit on the new resource — not merely none on the old one: an
    // earlier reassign (another request) may have left some of them elsewhere, and a single
    // assignment cannot describe a schedule scattered over several resources.
    if (assignments.some((a) => a.resourceId !== toResourceId)) return;

    schedule.reassignResource(fromResourceId, toResourceId);
    await deps.scheduleRepo.save(schedule);
  });
}
