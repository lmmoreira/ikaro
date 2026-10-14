import { describe, expect, it } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { classifyStaffBookingFailure } from './staff-booking-failure';

describe('classifyStaffBookingFailure', () => {
  it.each([
    [BookingErrorCode.CUSTOMER_PHONE_NOT_SET, 'phone'],
    [BookingErrorCode.CUSTOMER_NOT_FOUND, 'customerNotFound'],
    [BookingErrorCode.SCHEDULED_IN_PAST, 'window'],
    [BookingErrorCode.TOO_SOON, 'window'],
    [BookingErrorCode.TOO_FAR_AHEAD, 'window'],
    [BookingErrorCode.SLOT_UNAVAILABLE, 'generic'],
    ['SOMETHING_ELSE', 'generic'],
    [undefined, 'generic'],
  ])('%s lands on the %s outcome', (code, kind) => {
    expect(classifyStaffBookingFailure(code)).toBe(kind);
  });
});
