import { describe, expect, it } from 'vitest';
import { matchBookingDetailRoute } from './booking-route';
import {
  isRecurringScheduleCreateRoute,
  matchRecurringScheduleRoute,
} from './recurring-schedule-route';

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

// Negative guarantee (M23-S19): "new" sits beside the dynamic segment, so without the exclusion the
// topbar and the bottom nav would treat the staff pattern page as the approval screen of a schedule
// whose id is "new". It holds by construction; this test is what notices a regression.
describe('the staff "Nova recorrência" pattern page', () => {
  it('is recognised as its own create route', () => {
    expect(isRecurringScheduleCreateRoute('/dashboard/bookings/recurring/new')).toBe(true);
  });

  it('is never read as the approval screen of a schedule with id "new"', () => {
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring/new')).toBeNull();
  });

  it('is never read as a booking id either', () => {
    expect(matchBookingDetailRoute('/dashboard/bookings/recurring/new')).toBeNull();
  });

  it('is only that exact path', () => {
    expect(isRecurringScheduleCreateRoute('/dashboard/bookings/recurring/new/')).toBe(false);
    expect(isRecurringScheduleCreateRoute('/dashboard/bookings/recurring/new/extra')).toBe(false);
    expect(isRecurringScheduleCreateRoute('/dashboard/bookings/recurring/s-1')).toBe(false);
    expect(isRecurringScheduleCreateRoute('/dashboard/bookings/new')).toBe(false);
  });

  it('still reads a schedule whose id merely starts with "new"', () => {
    expect(matchRecurringScheduleRoute('/dashboard/bookings/recurring/new-1')).toEqual({
      scheduleId: 'new-1',
    });
  });
});
