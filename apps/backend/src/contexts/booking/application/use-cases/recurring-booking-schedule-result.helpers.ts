import { RecurringBookingScheduleListItem } from '@ikaro/types';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { IResourceRepository } from '../ports/resource-repository.port';

// One mapping for a schedule as the API returns it, shared by the list and the by-id read so the
// two shapes cannot drift (the same split as toAvailabilityAlertResult for alerts). The wire type
// is the one definition in @ikaro/types.
export type RecurringBookingScheduleResult = RecurringBookingScheduleListItem;

export function toRecurringBookingScheduleResult(
  schedule: RecurringBookingSchedule,
  serviceName: string,
  renewable: boolean,
  // Resource names by id, only for a STAFF|MANAGER read (UC-071 shows which resource was picked).
  // Left undefined for a customer read: no resource name ever reaches a customer.
  resourceNames?: ReadonlyMap<string, string>,
): RecurringBookingScheduleResult {
  return {
    id: schedule.id,
    customerId: schedule.customerId,
    serviceId: schedule.serviceId,
    serviceName,
    recurrence: schedule.recurrence,
    startsOn: schedule.startsOn,
    endsOn: schedule.endsOn,
    status: schedule.status,
    assignmentPolicy: schedule.assignmentPolicy,
    resourceIds: schedule.resourceAssignments.map((assignment) => assignment.resourceId),
    resourceAssignments: schedule.resourceAssignments.map((assignment) => {
      const resourceName = resourceNames?.get(assignment.resourceId);
      return {
        resourceType: assignment.resourceType,
        resourceId: assignment.resourceId,
        ...(resourceName === undefined ? {} : { resourceName }),
      };
    }),
    approvalHoldExpiresAt: schedule.approvalHoldExpiresAt?.toISOString() ?? null,
    createdAt: schedule.createdAt.toISOString(),
    renewable,
  };
}

/**
 * The names of every resource picked by these schedules, in one tenant-scoped read (never one per
 * schedule). A resource absent from the result is simply left without a name.
 */
export async function loadPickedResourceNames(
  resourceRepo: IResourceRepository,
  tenantId: string,
  schedules: readonly RecurringBookingSchedule[],
): Promise<ReadonlyMap<string, string>> {
  const ids = [
    ...new Set(
      schedules.flatMap((schedule) =>
        schedule.resourceAssignments.map((assignment) => assignment.resourceId),
      ),
    ),
  ];
  if (ids.length === 0) return new Map();
  const resources = await resourceRepo.findByIds(ids, tenantId);
  return new Map(resources.map((resource) => [resource.id, resource.name]));
}
