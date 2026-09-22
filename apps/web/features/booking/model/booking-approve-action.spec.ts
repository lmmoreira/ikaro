// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type SlotConflictSuggestion } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { buildApproveHandler } from './booking-approve-action';

vi.mock('@/features/booking/api/availability', () => ({
  fetchBookingAvailability: vi.fn(),
}));

function baseParams(overrides: Partial<Parameters<typeof buildApproveHandler>[0]> = {}) {
  return {
    bookingId: 'b-1',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    tenantSlug: 'lavacar-beloauto',
    serviceIds: ['svc-1'],
    mutateAsync: vi.fn(),
    setBooking: vi.fn(),
    setActionState: vi.fn(),
    setSheetState: vi.fn(),
    setSlotSuggestions: vi.fn(),
    setInlineError: vi.fn(),
    translateLoadingAlternativesError: () => 'Falha ao carregar horários alternativos.',
    translateApproveError: () => 'Falha ao aprovar.',
    ...overrides,
  };
}

describe('buildApproveHandler', () => {
  afterEach(() => {
    vi.mocked(fetchBookingAvailability).mockReset();
  });

  it('marks the booking approved and clears the sheet on success', async () => {
    const params = baseParams({ mutateAsync: vi.fn().mockResolvedValue(undefined) });
    const handleApprove = buildApproveHandler(params);

    await handleApprove();

    expect(params.mutateAsync).toHaveBeenCalledWith({ id: 'b-1' });
    expect(params.setActionState).toHaveBeenCalledWith('submitting');
    expect(params.setActionState).toHaveBeenLastCalledWith('approved');
    expect(params.setSheetState).toHaveBeenCalledWith(null);
    const bookingUpdater = vi.mocked(params.setBooking).mock.calls[0][0];
    expect(bookingUpdater({ status: BOOKING_STATUS.PENDING, scheduledAt: 'old' })).toEqual(
      expect.objectContaining({ status: BOOKING_STATUS.APPROVED, scheduledAt: 'old' }),
    );
  });

  it('passes a rescheduled scheduledAt through to both the mutation and the booking update', async () => {
    const params = baseParams({ mutateAsync: vi.fn().mockResolvedValue(undefined) });
    const handleApprove = buildApproveHandler(params);

    await handleApprove('2026-06-17T14:00:00.000Z');

    expect(params.mutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: { scheduledAt: '2026-06-17T14:00:00.000Z' },
    });
    const bookingUpdater = vi.mocked(params.setBooking).mock.calls[0][0];
    expect(bookingUpdater({ status: BOOKING_STATUS.PENDING, scheduledAt: 'old' })).toEqual(
      expect.objectContaining({ scheduledAt: '2026-06-17T14:00:00.000Z' }),
    );
  });

  it('routes a 409 conflict to the slot-conflict state with fresh suggestions', async () => {
    const suggestions: SlotConflictSuggestion[] = [
      { startsAt: '2026-06-17T14:00:00.000Z', endsAt: '2026-06-17T14:30:00.000Z' },
    ];
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-16',
      available: true,
      slots: suggestions,
    });
    const params = baseParams({
      mutateAsync: vi.fn().mockRejectedValue(new ApiError(409, 'Conflict')),
    });
    const handleApprove = buildApproveHandler(params);

    await handleApprove();

    expect(params.setSlotSuggestions).toHaveBeenCalledWith(suggestions);
    expect(params.setActionState).toHaveBeenLastCalledWith('slot-conflict');
  });

  it('falls back to a generic error when reloading alternatives after a conflict also fails', async () => {
    vi.mocked(fetchBookingAvailability).mockRejectedValue(new Error('network error'));
    const params = baseParams({
      mutateAsync: vi.fn().mockRejectedValue(new ApiError(409, 'Conflict')),
    });
    const handleApprove = buildApproveHandler(params);

    await handleApprove();

    expect(params.setActionState).toHaveBeenLastCalledWith('idle');
    expect(params.setInlineError).toHaveBeenLastCalledWith(
      'Falha ao carregar horários alternativos.',
    );
  });

  it('sets a generic approve error for a non-conflict failure', async () => {
    const params = baseParams({ mutateAsync: vi.fn().mockRejectedValue(new Error('boom')) });
    const handleApprove = buildApproveHandler(params);

    await handleApprove();

    expect(params.setActionState).toHaveBeenLastCalledWith('idle');
    expect(params.setInlineError).toHaveBeenLastCalledWith('Falha ao aprovar.');
  });
});
