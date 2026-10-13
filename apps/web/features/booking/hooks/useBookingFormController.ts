'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomerProfileResponse, HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import type { BookingDeepLinkSeed } from '@/features/booking/model/booking-deep-link';
import { buildIntakeRequestFields } from '@/features/booking/model/intake-answers';
import { useBookingFormCore } from './useBookingFormCore';
import { useBookingSubmission } from './useBookingSubmission';

interface Params {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly addressSpec: HotsiteAddressSpec;
  /** What the availability-alert email's link pre-selects; null on the plain booking page. */
  readonly seed?: BookingDeepLinkSeed | null;
}

function useCustomerProfile(slug: string) {
  const [customerProfile, setCustomerProfile] = useState<
    CustomerProfileResponse | null | undefined
  >(undefined);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile(slug)
      .then((profile) => active && setCustomerProfile(profile))
      .catch(() => active && setCustomerProfile(null));
    return () => {
      active = false;
    };
  }, [slug]);

  return { customerProfile, setCustomerProfile };
}

// The hotsite's booking form: the shared core (useBookingFormCore) plus what only the hotsite
// does — the customer's own profile as the pickup default, the guest or authenticated submit, and
// a 401 that goes to the business's login page.
export function useBookingFormController({ slug, services, addressSpec, seed = null }: Params) {
  const router = useRouter();
  const locale = useResolvedLocale();
  const { customerProfile, setCustomerProfile } = useCustomerProfile(slug);
  const core = useBookingFormCore({
    slug,
    services,
    seed,
    defaultAddress: customerProfile?.defaultAddress,
    onLogin: () => {
      const returnTo = encodeURIComponent(`/${slug}/booking`);
      router.push(`/${slug}/login?returnTo=${returnTo}`);
    },
  });
  const { selections, formData, flow } = core;

  const submission = useBookingSubmission({
    slug,
    customerProfile,
    onCustomerProfileResolved: setCustomerProfile,
    selectedServiceIds: selections.selectedServiceIds,
    selectedSlot: selections.selectedSlot,
    pickupAddress: core.pickupAddress,
    requiresPickupAddress: core.requiresPickupAddress,
    personalInfo: selections.personalInfo,
    addressSpec,
    resourcePicks: core.resourceSelections,
    durationMinutes: selections.duration?.minutes,
    intakeFields:
      formData.intakeSchema === null
        ? null
        : buildIntakeRequestFields(formData.intakeSchema, selections.intake),
    locale,
    steps: flow.steps,
    resolveInvalidPickerStep: core.resolveInvalidPickerStep,
    onRoute: core.onRoute,
    onSubmitStart: flow.clearErrors,
  });

  return {
    ...core,
    submission,
    isAuthenticatedCustomer: customerProfile !== null && customerProfile !== undefined,
  };
}
