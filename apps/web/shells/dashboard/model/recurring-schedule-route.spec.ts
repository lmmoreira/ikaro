import { describe, expect, it } from 'vitest';
import { matchBookingDetailRoute } from './booking-route';
import { matchRecurringScheduleRoute } from './recurring-schedule-route';

describe('matchRecurringScheduleRoute', () => {
  it('matches the approval screen and returns the schedule id', () => {
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring/s-1')).toEqual({
      scheduleId: 's-1',
    });
  });

  it('does not match the Agenda or a booking detail', () => {
    expect(matchRecurringScheduleRoute('/dashboard/bookings')).toBeNull();
    expect(matchRecurringScheduleRoute('/dashboard/bookings/b-1')).toBeNull();
    expect(matchRecurringScheduleRoute('/dashboard/bookings/b-1/complete')).toBeNull();
  });

  it('does not match a bare "recurring" segment, a deeper path or another section', () => {
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring')).toBeNull();
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring/')).toBeNull();
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring/s-1/extra')).toBeNull();
    expect(matchRecurringScheduleRoute('/dashboard/schedule/recurring/s-1')).toBeNull();
  });

  it('is never read as a booking id by the booking detail matcher (the two routes stay apart)', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/recurring/s-1')).toBeNull();
  });
});
