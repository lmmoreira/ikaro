import { RecurringBookingScheduleCapReachedError } from '../../domain/errors/recurring-booking-schedule.error';
import { IRecurringBookingScheduleRepository } from '../ports/recurring-booking-schedule-repository.port';

// App-enforced caps (docs/02-DOMAIN_MODEL.md § RecurringBookingSchedule), not DB constraints.
const MAX_ACTIVE_SCHEDULES_PER_RESOURCE = 50;
const MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE = 50;

export interface CapCheckParams {
  tenantId: string;
  serviceId: string;
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
  resourceIds: string[];
}

// Must run inside the same transaction, after the resource/service advisory lock, so the count it
// reads cannot be raced by a concurrent request (docs/13-DATABASE_SCHEMA.md's lock protocol). Only
// `ACTIVE` schedules count, so an ENDED or CANCELLED one never holds a slot.
export async function assertUnderCap(
  scheduleRepo: IRecurringBookingScheduleRepository,
  params: CapCheckParams,
): Promise<void> {
  if (params.assignmentPolicy === 'FIXED_ASSIGNMENT') {
    for (const resourceId of params.resourceIds) {
      const count = await scheduleRepo.countActiveByResource(params.tenantId, resourceId);
      if (count >= MAX_ACTIVE_SCHEDULES_PER_RESOURCE) {
        throw new RecurringBookingScheduleCapReachedError('resource');
      }
    }
    return;
  }
  const count = await scheduleRepo.countActiveResolvePerOccurrenceByService(
    params.tenantId,
    params.serviceId,
  );
  if (count >= MAX_ACTIVE_RESOLVE_PER_OCCURRENCE_SCHEDULES_PER_SERVICE) {
    throw new RecurringBookingScheduleCapReachedError('service');
  }
}
