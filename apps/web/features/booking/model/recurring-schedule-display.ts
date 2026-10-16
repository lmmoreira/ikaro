import type {
  RecurrenceRule,
  RecurringScheduleStatus,
  RecurringScheduleWeekday,
} from '@ikaro/types';

// How a recurring schedule is shown, for every surface that shows one: the customer's "Minha Conta"
// and the staff Agenda. These helpers are pure and belong to the booking slice, which owns the
// schedule; the customer slice consumes them (it re-exports them from its own model).

export const RECURRING_SCHEDULE_STATUS_CLASSES: Record<RecurringScheduleStatus, string> = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800',
  ACTIVE: 'bg-green-100 text-green-800',
  ENDED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

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
