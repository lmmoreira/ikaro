import { Booking } from '../../domain/booking.aggregate';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { ReassignedOccurrence } from './future-commitment-schedule-sync.helpers';
import { loadServiceMap, WorklistRescheduleDeps } from './future-commitment-reschedule.helpers';
import { ReassignTarget, reassignBookingResource } from './resource-reassignment.helpers';

export interface WorklistReassignInput {
  tenantId: string;
  timezone: string;
  target?: ReassignTarget;
}

export interface WorklistReassignResult {
  occurrence: ReassignedOccurrence | null;
  newResourceName: string | null;
}

// The worklist's REASSIGN (UC-077): the booking keeps its time and moves to another resource. The
// lock set is the candidate target resources only, never the deactivated source, so it takes no
// lock a reactivation of the source could be holding (docs/LOCK_CATALOG.md hazard H2).
export async function reassignThroughWorklist(
  deps: WorklistRescheduleDeps,
  input: WorklistReassignInput,
  exception: FutureCommitmentException,
  booking: Booking,
): Promise<WorklistReassignResult> {
  const { targetResourceId, targetResourceName, disclosesResource } = await reassignBookingResource(
    {
      resourceRepo: deps.resourceRepo,
      occupancyRepo: deps.occupancyRepo,
      tenantLock: deps.tenantLock,
      availabilityService: deps.availabilityService,
    },
    {
      tenantId: input.tenantId,
      booking,
      serviceMap: await loadServiceMap(deps, booking, input.tenantId),
      sourceResourceId: exception.sourceId,
      target: input.target ?? { mode: 'AUTO' },
      timezone: input.timezone,
    },
  );
  // UC-062/063: the customer is told the new resource's name only when the requirement shows it.
  const newResourceName = disclosesResource ? targetResourceName : null;
  if (!booking.recurringScheduleId) return { occurrence: null, newResourceName };
  return {
    occurrence: {
      recurringScheduleId: booking.recurringScheduleId,
      fromResourceId: exception.sourceId,
      toResourceId: targetResourceId,
    },
    newResourceName,
  };
}
