import type { RecurringBookingScheduleListItem, RecurringScheduleStatus } from '@ikaro/types';

// The display helpers shared with the staff Agenda live in the booking slice, which owns the
// schedule; the customer surfaces keep importing them from here.
export {
  RECURRING_SCHEDULE_STATUS_CLASSES,
  dateKeyToDate,
  recurrenceEndTime,
  sortedWeekdays,
} from '@/features/booking/model/recurring-schedule-display';

// 5 to a page: a term can reach 180 days, so a schedule on several weekdays can hold well over a
// hundred occurrences, and the customer must be able to reach any future one to skip or move it.
export const RECURRING_OCCURRENCES_PAGE_SIZE = 5;

export interface RecurringScheduleSections {
  readonly active: RecurringBookingScheduleListItem[];
  readonly pending: RecurringBookingScheduleListItem[];
  readonly ended: RecurringBookingScheduleListItem[];
}

/** ENDED (term over) and CANCELLED (ended early, rejected or expired) both read as "Encerradas". */
export function splitRecurringScheduleSections(
  items: readonly RecurringBookingScheduleListItem[],
): RecurringScheduleSections {
  return {
    active: items.filter((s) => s.status === 'ACTIVE'),
    pending: items.filter((s) => s.status === 'PENDING_APPROVAL'),
    ended: items.filter((s) => s.status === 'CANCELLED' || s.status === 'ENDED'),
  };
}

export function isTerminalRecurringSchedule(status: RecurringScheduleStatus): boolean {
  return status === 'CANCELLED' || status === 'ENDED';
}

/** The occurrences shown for a schedule: upcoming approved ones while it runs, the whole period after. */
export const ACTIVE_OCCURRENCE_STATUS = 'APPROVED';
export const TERMINAL_OCCURRENCE_STATUSES =
  'PENDING,INFO_REQUESTED,APPROVED,COMPLETED,CANCELLED,REJECTED,NO_SHOW';

export function recurringScheduleListPath(tenantSlug: string): string {
  return `/${tenantSlug}/my-account/recurring-schedules`;
}

/** The creation flow (M23-S17): one route, the review and the outcomes are states of it. */
export function recurringScheduleNewPath(tenantSlug: string): string {
  return `${recurringScheduleListPath(tenantSlug)}/new`;
}

/** The creation flow opened pre-filled from a schedule being renewed (the reminder email links here too). */
export function recurringScheduleRenewPath(tenantSlug: string, scheduleId: string): string {
  return `${recurringScheduleNewPath(tenantSlug)}?renewFrom=${scheduleId}`;
}

/**
 * The "Renovar" action, following the server's `renewable` flag (an active schedule inside the
 * tenant's renewal window — a setting the customer cannot read — or an ended one, in both cases only
 * while the customer has no successor schedule). A running schedule needs the flag to be true; an
 * ended one is offered unless the flag is false, so an older response without the flag (a rolling
 * deploy) keeps showing it as it did before the flag existed.
 */
export function offersRenewal(
  schedule: Pick<RecurringBookingScheduleListItem, 'status' | 'renewable'>,
): boolean {
  if (schedule.status === 'ENDED') return schedule.renewable !== false;
  return schedule.status === 'ACTIVE' && schedule.renewable === true;
}

/** The detail page, optionally on a given occurrence page — page 1 stays the bare URL. */
export function recurringScheduleDetailPath(
  tenantSlug: string,
  scheduleId: string,
  page = 1,
): string {
  const base = `${recurringScheduleListPath(tenantSlug)}/${scheduleId}`;
  return page > 1 ? `${base}?page=${page}` : base;
}

export function recurringScheduleEndPath(tenantSlug: string, scheduleId: string): string {
  return `${recurringScheduleListPath(tenantSlug)}/${scheduleId}/end`;
}

/** `?page=` from the URL: a positive integer, anything else is the first page. */
export function parseOccurrencePage(raw: string | undefined): number {
  if (raw === undefined || !/^[1-9]\d{0,5}$/.test(raw)) return 1;
  return Number(raw);
}

export function totalOccurrencePages(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}
