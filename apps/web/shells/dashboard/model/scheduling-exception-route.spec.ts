import { describe, expect, it } from 'vitest';
import { matchSchedulingExceptionRescheduleRoute } from './scheduling-exception-route';

describe('matchSchedulingExceptionRescheduleRoute', () => {
  it('matches the reschedule drill-down and returns the entry id', () => {
    expect(
      matchSchedulingExceptionRescheduleRoute('/dashboard/scheduling-exceptions/exc-1/reschedule'),
    ).toEqual({ exceptionId: 'exc-1' });
  });

  it('does not match the list (a top-level page with no back link)', () => {
    expect(matchSchedulingExceptionRescheduleRoute('/dashboard/scheduling-exceptions')).toBeNull();
  });

  it('does not match a deeper or different path, nor another section', () => {
    expect(
      matchSchedulingExceptionRescheduleRoute('/dashboard/scheduling-exceptions/exc-1'),
    ).toBeNull();
    expect(
      matchSchedulingExceptionRescheduleRoute(
        '/dashboard/scheduling-exceptions/exc-1/reschedule/extra',
      ),
    ).toBeNull();
    expect(
      matchSchedulingExceptionRescheduleRoute('/dashboard/bookings/b-1/reschedule'),
    ).toBeNull();
  });
});
