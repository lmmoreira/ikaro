import { describe, expect, it } from 'vitest';
import { appendReturnTo, resolveReturnTo } from './booking-navigation';

describe('booking navigation helpers', () => {
  it('validates dashboard return urls only', () => {
    expect(resolveReturnTo('/dashboard/schedule?weekStart=2026-07-01&date=2026-07-02')).toBe(
      '/dashboard/schedule?weekStart=2026-07-01&date=2026-07-02',
    );
    expect(resolveReturnTo('/customers')).toBeNull();
    expect(resolveReturnTo(undefined)).toBeNull();
  });

  it('appends returnTo query params when present', () => {
    expect(appendReturnTo('/dashboard/bookings/123/complete', '/dashboard/schedule')).toBe(
      '/dashboard/bookings/123/complete?returnTo=%2Fdashboard%2Fschedule',
    );
    expect(appendReturnTo('/dashboard/bookings/123/complete', null)).toBe(
      '/dashboard/bookings/123/complete',
    );
  });
});
