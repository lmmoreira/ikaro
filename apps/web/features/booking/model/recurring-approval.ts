import type {
  RecurringBookingScheduleListItem,
  RecurringScheduleResourceAssignment,
  ResourceRequirementItem,
  ResourceType,
} from '@ikaro/types';
import { addDaysToDateKey, getWeekdayKey } from '@/features/booking/schedule/date-utils';

/** The staff screen for one recurring-schedule request (M23-S13); the Agenda card and M23-S47's "Origem" link both lead here. */
export function recurringScheduleStaffPath(scheduleId: string): string {
  return `/dashboard/bookings/recurring/${scheduleId}`;
}

/**
 * The most reservations an approval can create for this request: one per matching weekday between
 * `startsOn` and `endsOn`, both inclusive. It is an upper bound, never the final count — approval
 * drops the dates that started while the request waited (M23-S35), so the approved banner reports
 * the response's own `occurrenceCount` instead. Dates are tenant-local calendar keys, so there is no
 * timezone arithmetic here.
 */
export function maxOccurrenceCount(
  schedule: Pick<RecurringBookingScheduleListItem, 'startsOn' | 'endsOn' | 'recurrence'>,
): number {
  const weekdays = new Set(schedule.recurrence.daysOfWeek);
  let count = 0;
  for (let day = schedule.startsOn; day <= schedule.endsOn; day = addDaysToDateKey(day, 1)) {
    if (weekdays.has(getWeekdayKey(day))) count += 1;
  }
  return count;
}

/**
 * The requests waiting for a decision, most urgent first: the closest approval deadline on top.
 * A recurrence has no appointment time to sort by, so its hold expiry is the only urgency it has.
 */
export function sortByDecisionDeadline(
  schedules: readonly RecurringBookingScheduleListItem[],
): RecurringBookingScheduleListItem[] {
  const deadline = (schedule: RecurringBookingScheduleListItem): number =>
    schedule.approvalHoldExpiresAt
      ? new Date(schedule.approvalHoldExpiresAt).getTime()
      : Number.POSITIVE_INFINITY;
  return [...schedules].sort((a, b) => deadline(a) - deadline(b));
}

export type RecurringResourceRow =
  | { readonly kind: 'picked'; readonly type: ResourceType; readonly resourceId: string }
  | { readonly kind: 'automatic'; readonly type: ResourceType };

/**
 * One row per resource requirement of the service, in the service's own order. A requirement the
 * customer chose (`CUSTOMER_CHOICE`) shows the stored pick; an automatic one differs on every
 * occurrence and exists at no schedule level, so it reads "resolved on each reservation". A
 * requirement with no resource at all (`NONE`, the default location) draws no row.
 *
 * `resourceAssignments` holds only the customer's picks, keyed by resource type; two requirements of
 * the same type consume them in requirement order.
 */
export function buildResourceRows(
  requirements: readonly ResourceRequirementItem[],
  assignments: readonly RecurringScheduleResourceAssignment[],
): RecurringResourceRow[] {
  const remaining = [...assignments];
  const rows: RecurringResourceRow[] = [];

  for (const requirement of requirements) {
    if (requirement.selectionMode === 'NONE') continue;

    if (requirement.selectionMode === 'CUSTOMER_CHOICE') {
      const index = remaining.findIndex((a) => a.resourceType === requirement.type);
      const [pick] = index >= 0 ? remaining.splice(index, 1) : [];
      if (pick) {
        rows.push({ kind: 'picked', type: requirement.type, resourceId: pick.resourceId });
        continue;
      }
    }
    rows.push({ kind: 'automatic', type: requirement.type });
  }

  return rows;
}
