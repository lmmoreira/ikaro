// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { useInitialSlotSuggestions } from './useInitialSlotSuggestions';

vi.mock('@/features/booking/api/availability', () => ({ fetchBookingAvailability: vi.fn() }));

const SERVICE_IDS = ['svc-1'];

function setup(enabled = true) {
  const setters = {
    setSlotSuggestions: vi.fn(),
    setActionState: vi.fn(),
    setInlineError: vi.fn(),
    setIsLoading: vi.fn(),
  };
  renderHook(() =>
    useInitialSlotSuggestions({
      enabled,
      tenantSlug: 'lavacar-bh',
      scheduledAt: '2026-06-16T10:00:00.000Z',
      serviceIds: SERVICE_IDS,
      errorMessage: 'falhou',
      ...setters,
    }),
  );
  return setters;
}

describe('useInitialSlotSuggestions', () => {
  afterEach(() => vi.mocked(fetchBookingAvailability).mockReset());

  it('loads the alternatives for the booking day and stops loading', async () => {
    const slots = [{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }];
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-16',
      available: true,
      slots,
    });

    const setters = setup();

    await waitFor(() => expect(setters.setIsLoading).toHaveBeenCalledWith(false));
    expect(fetchBookingAvailability).toHaveBeenCalledWith('lavacar-bh', '2026-06-16', SERVICE_IDS);
    expect(setters.setSlotSuggestions).toHaveBeenCalledWith(slots);
  });

  it('returns to idle with the error message when the alternatives cannot be loaded', async () => {
    vi.mocked(fetchBookingAvailability).mockRejectedValue(new Error('network'));

    const setters = setup();

    await waitFor(() => expect(setters.setIsLoading).toHaveBeenCalledWith(false));
    expect(setters.setActionState).toHaveBeenCalledWith('idle');
    expect(setters.setInlineError).toHaveBeenCalledWith('falhou');
  });

  it('does nothing when not opened from the conflict shortcut', () => {
    const setters = setup(false);

    expect(fetchBookingAvailability).not.toHaveBeenCalled();
    expect(setters.setIsLoading).not.toHaveBeenCalled();
  });
});
