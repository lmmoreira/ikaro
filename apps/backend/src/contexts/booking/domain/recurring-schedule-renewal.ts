import { addDaysUTC } from '../../../shared/utils/calendar-date';
import { RecurringBookingScheduleStatus } from './recurring-booking-schedule.types';

// M23-S21 (docs/27 § Renewal window and reminder). N is `settings.booking.recurringRenewalReminderDays`:
// 0 turns the reminder off and empties the window of a running schedule. Dates are tenant-local
// calendar dates (YYYY-MM-DD).

interface RenewalScheduleFacts {
  status: RecurringBookingScheduleStatus;
  startsOn: string;
  endsOn: string;
}

/** The one day the reminder goes out: the schedule's last day is exactly N days from today. */
export function isRenewalReminderDue(
  schedule: RenewalScheduleFacts,
  localToday: string,
  reminderDays: number,
): boolean {
  if (reminderDays <= 0 || schedule.status !== 'ACTIVE') return false;
  if (schedule.endsOn !== addDaysUTC(localToday, reminderDays)) return false;
  // A term no longer than the lead time is over before the customer could act on the reminder.
  return schedule.startsOn < addDaysUTC(schedule.endsOn, -reminderDays);
}

/** Whether "Renovar" is offered now: a running schedule inside the window, or an ended one. */
export function isRenewalOffered(
  schedule: Pick<RenewalScheduleFacts, 'status' | 'endsOn'>,
  localToday: string,
  reminderDays: number,
): boolean {
  if (schedule.status === 'ENDED') return true;
  if (schedule.status !== 'ACTIVE' || reminderDays <= 0) return false;
  return schedule.endsOn >= localToday && schedule.endsOn <= addDaysUTC(localToday, reminderDays);
}
