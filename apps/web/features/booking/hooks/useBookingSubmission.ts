'use client';

import { useState } from 'react';
import { BookingErrorCode } from '@ikaro/types';
import type {
  Address,
  AvailableSlot,
  CreateBookingRequest,
  CustomerProfileResponse,
  HotsiteAddressSpec,
} from '@ikaro/types';
import {
  createAuthenticatedBooking,
  createBooking,
  type AuthenticatedBookingRequest,
} from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { extractProblemDetailShape } from '@/shared/lib/api/errors';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import {
  isAddressFilled,
  sanitizeAddress,
  type PersonalInfoValue,
} from '@/features/booking/model/personal-info';
import type { BookingSubmissionStatus } from '../components/public/ConfirmationStep';

type ErrorStep = 1 | 2 | 3 | 4;

function buildPayload(
  personalInfo: PersonalInfoValue,
  selectedServiceIds: readonly string[],
  selectedSlot: AvailableSlot,
  pickupAddress: Address,
  requiresPickupAddress: boolean,
  requireNeighborhood: boolean,
): CreateBookingRequest {
  return {
    contactName: personalInfo.contactName,
    contactEmail: personalInfo.contactEmail,
    contactPhone: personalInfo.contactPhone,
    scheduledAt: selectedSlot.startsAt,
    serviceIds: [...selectedServiceIds],
    ...(isAddressFilled(personalInfo.contactAddress, requireNeighborhood)
      ? { contactAddress: sanitizeAddress(personalInfo.contactAddress) }
      : {}),
    ...(requiresPickupAddress ? { pickupAddress: sanitizeAddress(pickupAddress) } : {}),
    ...(personalInfo.photoFilePaths.length > 0
      ? { beforeServicePhotoUrls: [...personalInfo.photoFilePaths] }
      : {}),
  };
}

interface BookingSubmitErrorRoute {
  readonly step: ErrorStep;
  readonly message: string;
}

function resolveBookingSubmitErrorRoute(
  err: unknown,
  locale: SupportedLocale,
): BookingSubmitErrorRoute {
  const shape = extractProblemDetailShape(err);
  if (!shape) {
    return { step: 4, message: resolveErrorMessage(undefined, locale) };
  }
  if (shape.code === BookingErrorCode.SLOT_UNAVAILABLE) {
    return { step: 2, message: resolveErrorMessage(shape.code, locale) };
  }
  if (shape.field === 'pickupAddress') {
    return { step: 1, message: resolveErrorMessage(shape.code, locale) };
  }
  if (shape.field === 'contactAddress') {
    return { step: 3, message: resolveErrorMessage(shape.code, locale) };
  }
  return { step: 4, message: resolveErrorMessage(shape.code, locale) };
}

function buildAuthenticatedPayload(
  selectedServiceIds: readonly string[],
  selectedSlot: AvailableSlot,
  pickupAddress: Address,
  requiresPickupAddress: boolean,
  photoFilePaths: readonly string[],
): AuthenticatedBookingRequest {
  return {
    scheduledAt: selectedSlot.startsAt,
    serviceIds: [...selectedServiceIds],
    ...(requiresPickupAddress ? { pickupAddress: sanitizeAddress(pickupAddress) } : {}),
    ...(photoFilePaths.length > 0 ? { beforeServicePhotoUrls: [...photoFilePaths] } : {}),
  };
}

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
  readonly locale: SupportedLocale;
  readonly onErrorStep: (step: ErrorStep) => void;
}

interface UseBookingSubmissionResult {
  readonly status: BookingSubmissionStatus;
  readonly errorMessage: string | null;
  readonly step1Error: string | null;
  readonly step2Error: string | null;
  readonly step3Error: string | null;
  readonly clearStep2Error: () => void;
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

async function submitBooking(
  params: UseBookingSubmissionParams,
  resolvedProfile: CustomerProfileResponse | null,
): Promise<void> {
  if (!params.selectedSlot) return;

  if (resolvedProfile) {
    await createAuthenticatedBooking(
      buildAuthenticatedPayload(
        params.selectedServiceIds,
        params.selectedSlot,
        params.pickupAddress,
        params.requiresPickupAddress,
        params.personalInfo.photoFilePaths,
      ),
    );
    return;
  }

  const payload = buildPayload(
    params.personalInfo,
    params.selectedServiceIds,
    params.selectedSlot,
    params.pickupAddress,
    params.requiresPickupAddress,
    params.addressSpec.requireNeighborhood,
  );
  await createBooking(params.slug, payload);
}

interface ErrorRouteSetters {
  readonly setStatus: (status: BookingSubmissionStatus) => void;
  readonly setErrorMessage: (message: string | null) => void;
  readonly setStep1Error: (message: string | null) => void;
  readonly setStep2Error: (message: string | null) => void;
  readonly setStep3Error: (message: string | null) => void;
  readonly onErrorStep: (step: ErrorStep) => void;
}

function applyBookingSubmitErrorRoute(
  route: BookingSubmitErrorRoute,
  setters: ErrorRouteSetters,
): void {
  setters.setStatus(route.step === 4 ? 'error' : 'idle');
  setters.setStep1Error(route.step === 1 ? route.message : null);
  setters.setStep2Error(route.step === 2 ? route.message : null);
  setters.setStep3Error(route.step === 3 ? route.message : null);
  setters.setErrorMessage(route.step === 4 ? route.message : null);
  setters.onErrorStep(route.step);
}

async function submitAndRouteErrors(
  params: UseBookingSubmissionParams,
  setters: ErrorRouteSetters,
): Promise<void> {
  if (!params.selectedSlot) return;

  setters.setStatus('submitting');
  setters.setErrorMessage(null);
  setters.setStep1Error(null);
  setters.setStep2Error(null);
  setters.setStep3Error(null);

  try {
    const resolvedProfile = await resolveCustomerProfileForSubmit(params);
    await submitBooking(params, resolvedProfile);
    setters.setStatus('success');
  } catch (err) {
    applyBookingSubmitErrorRoute(resolveBookingSubmitErrorRoute(err, params.locale), setters);
  }
}

// Extracted from BookingForm (TD37-S5A) — the submission flow (payload building, error-route
// resolution, and the status/per-step-error state it drives) is a self-contained concern,
// unrelated to step navigation or field rendering.
export function useBookingSubmission(
  params: UseBookingSubmissionParams,
): UseBookingSubmissionResult {
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step3Error, setStep3Error] = useState<string | null>(null);
  const setters: ErrorRouteSetters = {
    setStatus,
    setErrorMessage,
    setStep1Error,
    setStep2Error,
    setStep3Error,
    onErrorStep: params.onErrorStep,
  };

  return {
    status,
    errorMessage,
    step1Error,
    step2Error,
    step3Error,
    clearStep2Error: () => setStep2Error(null),
    handleSubmit: () => submitAndRouteErrors(params, setters),
  };
}
