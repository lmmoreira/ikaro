import { describe, expect, it } from 'vitest';
import {
  getCustomerNavItems,
  getNavIconClass,
  shouldShowCustomerBottomNav,
} from './customer-nav-items';

describe('getNavIconClass', () => {
  it('applies the size and color classes with full opacity when active', () => {
    expect(getNavIconClass('h-4 w-4', 'text-blue-600', true)).toBe(
      'h-4 w-4 shrink-0 text-blue-600 opacity-100',
    );
  });

  it('applies reduced opacity when inactive', () => {
    expect(getNavIconClass('h-4 w-4', 'text-blue-600', false)).toBe(
      'h-4 w-4 shrink-0 text-blue-600 opacity-60',
    );
  });
});

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

describe('getCustomerNavItems', () => {
  const hrefs = (items: ReturnType<typeof getCustomerNavItems>) =>
    items.map((item) => item.href.split('/my-account')[1] || '/');

  it('shows every tab when the tenant features are unknown', () => {
    expect(hrefs(getCustomerNavItems('t'))).toEqual(['/', '/bookings', '/loyalty']);
    expect(hrefs(getCustomerNavItems('t', null))).toEqual(['/', '/bookings', '/loyalty']);
  });

  it('shows every tab when the tenant holds both features', () => {
    expect(hrefs(getCustomerNavItems('t', ['BOOKING', 'LOYALTY']))).toEqual([
      '/',
      '/bookings',
      '/loyalty',
    ]);
  });

  it('hides the loyalty tab for a tenant without LOYALTY', () => {
    expect(hrefs(getCustomerNavItems('t', ['BOOKING']))).toEqual(['/', '/bookings']);
  });

  it('hides the bookings tab for a tenant without BOOKING', () => {
    expect(hrefs(getCustomerNavItems('t', ['LOYALTY']))).toEqual(['/', '/loyalty']);
  });

  it('always keeps Início, even for a tenant holding none', () => {
    expect(hrefs(getCustomerNavItems('t', []))).toEqual(['/']);
  });
});
