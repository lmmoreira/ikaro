'use client';

import { useRouter } from 'next/navigation';
import type { Address, HotsiteServiceResponse } from '@ikaro/types';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { buildOptionalIntakeRequestFields } from '@/features/booking/model/intake-answers';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import { STAFF_BOOKING_STEP_PLAN } from '@/features/booking/model/staff-booking-steps';
import { useBookingFormCore } from './useBookingFormCore';
import { useStaffBookingSubmission } from './useStaffBookingSubmission';

interface Params {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly recipient: StaffBookingRecipient;
  /** The chosen customer's saved address; undefined for a guest or while it is being fetched. */
  readonly defaultAddress: Address | null | undefined;
}

// The staff booking form (UC-108): the shared core (useBookingFormCore) plus what only staff do —
// the step list without the personal step, the chosen customer as the pickup default, the staff
// submit with an optional intake, and a 401 that goes to the dashboard login.
export function useStaffBookingFormController({
  slug,
  services,
  recipient,
  defaultAddress,
}: Params) {
  const router = useRouter();
  const locale = useResolvedLocale();
  const core = useBookingFormCore({
    slug,
    services,
    stepPlan: STAFF_BOOKING_STEP_PLAN,
    defaultAddress,
    onLogin: () => router.push(`/dashboard/login?tenantSlug=${encodeURIComponent(slug)}`),
  });
  const { selections, formData, flow } = core;

  const submission = useStaffBookingSubmission({
    recipient,
    selectedServiceIds: selections.selectedServiceIds,
    selectedSlot: selections.selectedSlot,
    pickupAddress: core.pickupAddress,
    requiresPickupAddress: core.requiresPickupAddress,
    resourcePicks: core.resourceSelections,
    durationMinutes: selections.duration?.minutes,
    intakeFields:
      formData.intakeSchema === null
        ? null
        : buildOptionalIntakeRequestFields(formData.intakeSchema, selections.intake),
    locale,
    steps: flow.steps,
    resolveInvalidPickerStep: core.resolveInvalidPickerStep,
    onRoute: core.onRoute,
    onSubmitStart: flow.clearErrors,
  });

  return { ...core, submission };
}
