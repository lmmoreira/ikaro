// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookingDetailTopbarSync } from './useBookingDetailTopbarSync';

const setBookingStatus = vi.fn();
const setBackHrefOverride = vi.fn();
const topbar = { setBookingStatus, setBackHrefOverride };

describe('useBookingDetailTopbarSync', () => {
  beforeEach(() => {
    setBookingStatus.mockReset();
    setBackHrefOverride.mockReset();
  });

  it('publishes the booking status and the return target, and clears both on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ status, returnTo }) => useBookingDetailTopbarSync(status, returnTo, topbar),
      { initialProps: { status: 'APPROVED' as const, returnTo: '/dashboard/bookings?x=1' } },
    );

    expect(setBookingStatus).toHaveBeenLastCalledWith('APPROVED');
    expect(setBackHrefOverride).toHaveBeenLastCalledWith('/dashboard/bookings?x=1');

    rerender({ status: 'NO_SHOW' as never, returnTo: '/dashboard/bookings?x=1' });
    expect(setBookingStatus).toHaveBeenLastCalledWith('NO_SHOW');

    unmount();
    expect(setBookingStatus).toHaveBeenLastCalledWith(null);
    expect(setBackHrefOverride).toHaveBeenLastCalledWith(null);
  });

  it('does nothing outside the dashboard topbar provider', () => {
    expect(() =>
      renderHook(() => useBookingDetailTopbarSync('APPROVED', null, null)).unmount(),
    ).not.toThrow();
    expect(setBookingStatus).not.toHaveBeenCalled();
  });
});
