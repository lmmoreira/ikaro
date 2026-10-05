'use client';

import { useState } from 'react';
import type {
  Address,
  AvailableSlot,
  BookingFlowRequestFields,
  BookingResponse,
  CustomerProfileResponse,
  HotsiteAddressSpec,
  ResourceSelectionItem,
} from '@ikaro/types';
import { createAuthenticatedBooking, createBooking } from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  buildAuthenticatedBookingPayload,
  buildGuestBookingPayload,
  type BookingPayloadSelections,
} from '@/features/booking/model/booking-payload';
import {
  resolveBookingSubmitErrorRoute,
  resolveErrorStep,
  type BookingStepId,
  type ResolvedErrorStep,
} from '@/features/booking/model/booking-steps';
import type { PersonalInfoValue } from '@/features/booking/model/personal-info';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import type { BookingSubmissionStatus } from '../components/public/ConfirmationStep';

interface UseBookingSubmissionParams {
  readonly slug: string;
  readonly customerProfile: CustomerProfileResponse | null | undefined;
  readonly onCustomerProfileResolved: (profile: CustomerProfileResponse | null) => void;
  readonly selectedServiceIds: readonly string[];
  readonly selectedSlot: AvailableSlot | null;
  readonly pickupAddress: Address;
  readonly requiresPickupAddress: boolean;
  readonly personalInfo: PersonalInfoValue;
  readonly addressSpec: HotsiteAddressSpec;
  readonly resourcePicks: readonly ResourceSelectionItem[];
  /** The customer-selected duration; undefined when no service in the basket has one. */
  readonly durationMinutes?: number;
  readonly intakeFields: BookingFlowRequestFields | null;
  readonly locale: SupportedLocale;
  readonly steps: readonly BookingStepId[];
  /** Re-fetches the options and returns the first picker step whose pick is missing or stale. */
  readonly resolveInvalidPickerStep: () => Promise<BookingStepId | null>;
  readonly onRoute: (resolved: ResolvedErrorStep) => void;
  readonly onSubmitStart: () => void;
}

export interface UseBookingSubmissionResult {
  readonly status: BookingSubmissionStatus;
  readonly booking: BookingResponse | null;
  readonly handleSubmit: () => Promise<void>;
}

async function resolveCustomerProfileForSubmit(
  params: UseBookingSubmissionParams,
): Promise<CustomerProfileResponse | null> {
  const resolvedProfile =
    params.customerProfile === undefined
      ? await getHotsiteCustomerProfile(params.slug)
      : params.customerProfile;
  if (resolvedProfile !== params.customerProfile) {
    params.onCustomerProfileResolved(resolvedProfile);
  }
  return resolvedProfile;
}

function payloadSelections(
  params: UseBookingSubmissionParams,
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

async function submitBooking(
  params: UseBookingSubmissionParams,
  resolvedProfile: CustomerProfileResponse | null,
  slot: AvailableSlot,
): Promise<BookingResponse> {
  const selections = payloadSelections(params, slot);
  if (resolvedProfile) {
    return createAuthenticatedBooking(
      buildAuthenticatedBookingPayload(params.personalInfo.photoFilePaths, selections),
    );
  }
  return createBooking(
    params.slug,
    buildGuestBookingPayload(
      params.personalInfo,
      selections,
      params.addressSpec.requireNeighborhood,
    ),
  );
}

async function routeSubmitError(
  err: unknown,
  params: UseBookingSubmissionParams,
): Promise<boolean> {
  const route = resolveBookingSubmitErrorRoute(err, params.locale);
  const invalidPicker = route.target === 'picker' ? await params.resolveInvalidPickerStep() : null;
  const resolved = resolveErrorStep(route, params.steps, params.locale, invalidPicker);
  params.onRoute(resolved);
  return resolved.kind === 'step' && resolved.stepId === 'confirmation';
}

// Extracted from BookingForm (TD37-S5A) — the submission flow (payload building, error-route
// resolution and the status it drives) is a self-contained concern, unrelated to step
// navigation or field rendering. Where an error lands is decided by booking-steps.ts.
export function useBookingSubmission(
  params: UseBookingSubmissionParams,
): UseBookingSubmissionResult {
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
  const [booking, setBooking] = useState<BookingResponse | null>(null);

  async function handleSubmit(): Promise<void> {
    if (!params.selectedSlot) return;
    setStatus('submitting');
    params.onSubmitStart();
    try {
      const resolvedProfile = await resolveCustomerProfileForSubmit(params);
      setBooking(await submitBooking(params, resolvedProfile, params.selectedSlot));
      setStatus('success');
    } catch (err) {
      setStatus((await routeSubmitError(err, params)) ? 'error' : 'idle');
    }
  }

  return { status, booking, handleSubmit };
}
