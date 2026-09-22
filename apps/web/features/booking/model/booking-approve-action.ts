import {
  BOOKING_STATUS,
  type SlotConflictSuggestion,
  type StaffBookingDetailResponse,
} from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import type { BookingDetailActionState } from '../components/dashboard/bookings/BookingDetailMainBanner';
import type { BookingDetailSheetState } from '../components/dashboard/bookings/BookingDetailSheets';

interface BuildApproveHandlerParams {
  readonly bookingId: string;
  readonly scheduledAt: string;
  readonly tenantSlug: string;
  readonly serviceIds: readonly string[];
  readonly mutateAsync: (input: { id: string; body?: { scheduledAt: string } }) => Promise<unknown>;
  readonly setBooking: (
    updater: (current: StaffBookingDetailResponse) => StaffBookingDetailResponse,
  ) => void;
  readonly setActionState: (state: BookingDetailActionState) => void;
  readonly setSheetState: (state: BookingDetailSheetState) => void;
  readonly setSlotSuggestions: (suggestions: readonly SlotConflictSuggestion[]) => void;
  readonly setInlineError: (message: string | null) => void;
  readonly translateLoadingAlternativesError: () => string;
  readonly translateApproveError: () => string;
}

async function recoverFromSlotConflict(params: BuildApproveHandlerParams): Promise<void> {
  try {
    const availability = await fetchBookingAvailability(
      params.tenantSlug,
      params.scheduledAt.slice(0, 10),
      params.serviceIds,
    );
    params.setSlotSuggestions(availability.slots);
    params.setActionState('slot-conflict');
  } catch {
    params.setActionState('idle');
    params.setInlineError(params.translateLoadingAlternativesError());
  }
}

// Extracted from BookingDetailPage (TD37-S5A) — approving a booking (including the slot-conflict
// recovery path) is a self-contained concern, unrelated to reject/info/cancel submission. Not a
// hook itself (calls no React hooks) — built fresh from the caller's current state/setters each
// render, same closure shape the inline handler had.
export function buildApproveHandler(
  params: BuildApproveHandlerParams,
): (nextScheduledAt?: string) => Promise<void> {
  return async (nextScheduledAt) => {
    params.setActionState('submitting');
    params.setInlineError(null);

    try {
      await params.mutateAsync(
        nextScheduledAt
          ? { id: params.bookingId, body: { scheduledAt: nextScheduledAt } }
          : { id: params.bookingId },
      );
      params.setBooking((current) => ({
        ...current,
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: nextScheduledAt ?? current.scheduledAt,
        approvedAt: new Date().toISOString(),
      }));
      params.setSheetState(null);
      params.setSlotSuggestions([]);
      params.setActionState('approved');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await recoverFromSlotConflict(params);
        return;
      }
      params.setActionState('idle');
      params.setInlineError(params.translateApproveError());
    }
  };
}
