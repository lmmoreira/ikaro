import type {
  RecurrenceRule,
  RecurringBookingScheduleListItem,
  RecurringScheduleStatus,
  RecurringScheduleWeekday,
} from '@ikaro/types';

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

export const RECURRING_SCHEDULE_STATUS_CLASSES: Record<RecurringScheduleStatus, string> = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ENDED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

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

/** HH:mm + minutes → HH:mm (wraps past midnight). */
export function recurrenceEndTime(
  recurrence: Pick<RecurrenceRule, 'startTime' | 'durationMinutes'>,
): string {
  const [hours = 0, minutes = 0] = recurrence.startTime.split(':').map(Number);
  const total = (hours * 60 + minutes + recurrence.durationMinutes) % (24 * 60);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

const WEEKDAY_ORDER: readonly RecurringScheduleWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

/** The recurrence's weekdays, Monday first (the API keeps the order the customer picked them in). */
export function sortedWeekdays(
  days: readonly RecurringScheduleWeekday[],
): RecurringScheduleWeekday[] {
  return [...days].sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
}

/** A `YYYY-MM-DD` key as a Date the formatting helpers (which pin a zone) show as that same day. */
export function dateKeyToDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00Z`);
}
