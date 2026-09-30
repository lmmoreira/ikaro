import { describe, expect, it } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import {
  BOOKING_STATUS_CLASSES,
  SCHEDULE_BOOKING_STATUS_ALL,
  SCHEDULE_BOOKING_STATUS_DEFAULT,
  SCHEDULE_BOOKING_STATUS_FILTER,
  SCHEDULE_BOOKING_TIMELINE_CLASSES,
  buildBookingStatusLabels,
} from './booking-status';

describe('booking-status model', () => {
  it('styles and labels every status, including NO_SHOW', () => {
    const labels = buildBookingStatusLabels((key) => key);

    for (const status of Object.values(BOOKING_STATUS)) {
      expect(BOOKING_STATUS_CLASSES[status]).toBeTruthy();
      expect(SCHEDULE_BOOKING_TIMELINE_CLASSES[status]).toBeTruthy();
      expect(labels[status]).toBeTruthy();
    }
    expect(labels[BOOKING_STATUS.NO_SHOW]).toBe('statusNoShow');
  });

  it('keeps NO_SHOW bookings visible in the default schedule status filter', () => {
    expect(SCHEDULE_BOOKING_STATUS_DEFAULT).toContain(BOOKING_STATUS.NO_SHOW);
    expect(SCHEDULE_BOOKING_STATUS_FILTER.split(',')).toContain('NO_SHOW');
    expect(SCHEDULE_BOOKING_STATUS_ALL.split(',')).toContain('NO_SHOW');
  });
});
