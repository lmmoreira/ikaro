'use client';

import type {
  Address,
  AvailableSlot,
  BookingFlowRequestFields,
  BookingResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { createBookingByStaff } from '@/features/booking/api/staff-bookings';
import type { BookingPayloadSelections } from '@/features/booking/model/booking-payload';
import {
  buildStaffBookingPayload,
  type StaffBookingRecipient,
} from '@/features/booking/model/staff-booking-payload';
import type { BookingSubmissionStatus } from '../components/public/ConfirmationStep';
import { useBookingSubmitRunner, type BookingSubmitRunnerParams } from './useBookingSubmitRunner';

interface UseStaffBookingSubmissionParams extends BookingSubmitRunnerParams {
  readonly recipient: StaffBookingRecipient;
  readonly selectedServiceIds: readonly string[];
  readonly pickupAddress: Address;
  readonly requiresPickupAddress: boolean;
  readonly resourcePicks: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly intakeFields: BookingFlowRequestFields | null;
}

export interface UseStaffBookingSubmissionResult {
  readonly status: BookingSubmissionStatus;
  readonly booking: BookingResponse | null;
  readonly handleSubmit: () => Promise<void>;
}

function payloadSelections(
  params: UseStaffBookingSubmissionParams,
  slot: AvailableSlot,
): BookingPayloadSelections {
  return {
    serviceIds: params.selectedServiceIds,
    slot,
    pickupAddress: params.pickupAddress,
    requiresPickupAddress: params.requiresPickupAddress,
    resourcePicks: params.resourcePicks,
    durationMinutes: params.durationMinutes,
    intakeFields: params.intakeFields,
  };
}

// The staff submission (UC-108): one request, `POST /bookings/staff`, for a customer or a guest.
// The status it drives and where an error lands are the shared runner's, as on the hotsite.
export function useStaffBookingSubmission(
  params: UseStaffBookingSubmissionParams,
): UseStaffBookingSubmissionResult {
  const { status, booking, run } = useBookingSubmitRunner(params);

  async function handleSubmit(): Promise<void> {
    await run((slot) =>
      createBookingByStaff(
        buildStaffBookingPayload(params.recipient, payloadSelections(params, slot)),
      ),
    );
  }

  return { status, booking, handleSubmit };
}
