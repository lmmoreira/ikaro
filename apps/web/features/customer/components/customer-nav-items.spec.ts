import { describe, expect, it } from 'vitest';
import { shouldShowCustomerBottomNav } from './customer-nav-items';

describe('shouldShowCustomerBottomNav', () => {
  it('shows the nav on the home tab route', () => {
    expect(shouldShowCustomerBottomNav('/lavacar-bh/my-account')).toBe(true);
  });

  it('shows the nav on the bookings tab route', () => {
    expect(shouldShowCustomerBottomNav('/lavacar-bh/my-account/bookings')).toBe(true);
  });

  it('shows the nav on the loyalty tab route', () => {
    expect(shouldShowCustomerBottomNav('/lavacar-bh/my-account/loyalty')).toBe(true);
  });

  it('hides the nav on a booking detail drill-down page', () => {
    expect(shouldShowCustomerBottomNav('/lavacar-bh/my-account/bookings/abc-123')).toBe(false);
  });

  it('hides the nav on the cancel confirmation page', () => {
    expect(shouldShowCustomerBottomNav('/lavacar-bh/my-account/bookings/abc-123/cancel')).toBe(
      false,
    );
  });

  it('hides the nav on the cancel error page', () => {
    expect(
      shouldShowCustomerBottomNav('/lavacar-bh/my-account/bookings/abc-123/cancel/error'),
    ).toBe(false);
  });
});
