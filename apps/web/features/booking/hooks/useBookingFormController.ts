'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookingErrorCode } from '@ikaro/types';
import type {
  Address,
  CustomerProfileResponse,
  HotsiteAddressSpec,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { buildIntakeRequestFields } from '@/features/booking/model/intake-answers';
import { isAddressBlank } from '@/features/booking/model/personal-info';
import {
  pickerStepId,
  resolveBookingSteps,
  resolvePickerUnits,
  type BookingStepId,
  type ResolvedErrorStep,
} from '@/features/booking/model/booking-steps';
import {
  findPick,
  orderPicks,
  removeInvalidPicks,
  setPick,
  toResourceSelectionItem,
} from '@/features/booking/model/resource-picks';
import { useBookingFlow } from './useBookingFlow';
import { useBookingFormData } from './useBookingFormData';
import { useBookingSelections } from './useBookingSelections';
import { useBookingSubmission } from './useBookingSubmission';

interface Params {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly addressSpec: HotsiteAddressSpec;
}

const CLEARS_SLOT = new Set<string>([
  BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE,
  BookingErrorCode.LEG_UNAVAILABLE,
]);

// The first picker step with a missing or no-longer-valid pick, given the (re-fetched) options.
function firstInvalidPickerStep(
  services: readonly HotsiteServiceResponse[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
  picks: readonly ResourceSelectionItem[],
): BookingStepId | null {
  for (const unit of resolvePickerUnits(services)) {
    const needed = requirements.filter(
      (req) => req.serviceId === unit.serviceId && (req.legIndex ?? null) === unit.legIndex,
    );
    const valid = removeInvalidPicks(picks, needed);
    if (needed.some((req) => findPick(valid, req) === undefined)) return pickerStepId(unit);
  }
  return null;
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

// The selections, the step list they produce and the fetch that finalises it.
function useBookingFormState({ slug, services }: Params) {
  const bookable = useMemo(
    () => services.filter((service) => service.bookingModel === 'APPOINTMENT'),
    [services],
  );
  const selections = useBookingSelections(bookable);
  const { selectedServices, picks, selectedServiceIds } = selections;
  const { data, load, refetchOptions } = useBookingFormData({ slug, selectedServices });
  const hasUnavailable = selectedServices.some((s) => data.unavailableServiceIds.includes(s.id));
  const flow = useBookingFlow({
    selectedServices,
    resolved: data.status === 'ready' && !hasUnavailable,
    hasIntake: data.intakeSchema !== null,
  });
  const resourceSelections = useMemo(
    () => orderPicks(picks, selectedServiceIds),
    [picks, selectedServiceIds],
  );
  return { bookable, selections, data, load, refetchOptions, flow, resourceSelections };
}

type FormState = ReturnType<typeof useBookingFormState>;

// What "the picker is wrong" means: re-fetch the options, drop the picks no longer offered and
// find the first step that needs a new one. A failed re-fetch leaves the picker with a retry.
function usePickerRecovery(state: FormState) {
  const { selections, data, refetchOptions, flow } = state;
  const [pickerFetchFailed, setPickerFetchFailed] = useState(false);

  async function resolveInvalidPickerStep(): Promise<BookingStepId | null> {
    const fresh = await refetchOptions();
    setPickerFetchFailed(fresh === null);
    const requirements = fresh ?? data.requirements;
    selections.setPicks(removeInvalidPicks(selections.picks, requirements));
    // A pool with nothing left to offer cannot be re-picked: the service is unbookable, so the
    // customer returns to Step 1 (where it now shows as unavailable) instead of an empty picker.
    if (requirements.some((req) => req.options.length === 0)) return 'services';
    return (
      firstInvalidPickerStep(selections.selectedServices, requirements, selections.picks) ??
      flow.steps.find((id) => id.startsWith('picker:')) ??
      null
    );
  }

  async function retryPickerOptions() {
    const fresh = await refetchOptions();
    setPickerFetchFailed(fresh === null);
    if (fresh) selections.setPicks(removeInvalidPicks(selections.picks, fresh));
  }

  return { pickerFetchFailed, resolveInvalidPickerStep, retryPickerOptions };
}

// The pickup address defaults to the customer's saved one until they edit it.
function usePickupAddress(
  state: FormState,
  customerProfile: CustomerProfileResponse | null | undefined,
) {
  const { selections } = state;
  const [edited, setEdited] = useState(false);
  const requiresPickupAddress = selections.selectedServices.some((s) => s.requiresPickupAddress);
  const pickupAddress: Address =
    requiresPickupAddress &&
    !edited &&
    isAddressBlank(selections.personalInfo.pickupAddress) &&
    customerProfile?.defaultAddress
      ? customerProfile.defaultAddress
      : selections.personalInfo.pickupAddress;

  return {
    pickupAddress,
    requiresPickupAddress,
    editPickupAddress: (address: Address) => {
      setEdited(true);
      selections.setPersonalInfo({ ...selections.personalInfo, pickupAddress: address });
    },
  };
}

// Where an error returns the customer to: a step of the list, or the login for a 401.
function useErrorRouting(slug: string, state: FormState) {
  const router = useRouter();
  const { selections, flow } = state;
  return function handleRoute(resolved: ResolvedErrorStep) {
    if (resolved.kind === 'login') {
      const returnTo = encodeURIComponent(`/${slug}/booking`);
      router.push(`/${slug}/login?returnTo=${returnTo}`);
      return;
    }
    if (resolved.code && CLEARS_SLOT.has(resolved.code)) selections.clearSlot();
    // The duration the server rejected is dropped (with the slot searched for it): the duration
    // step reopens on a valid choice only, never on the stale one.
    if (resolved.code === BookingErrorCode.DURATION_OUT_OF_RANGE) selections.clearDuration();
    flow.setError(resolved.stepId, { message: resolved.message, code: resolved.code });
    flow.goTo(resolved.stepId);
  };
}

function useBookingFormSubmit(
  { slug, addressSpec }: Params,
  state: FormState,
  pickerRecovery: ReturnType<typeof usePickerRecovery>,
) {
  const locale = useResolvedLocale();
  const { selections, data, flow, resourceSelections } = state;
  const { customerProfile, setCustomerProfile } = useCustomerProfile(slug);
  const pickup = usePickupAddress(state, customerProfile);
  const onRoute = useErrorRouting(slug, state);

  const submission = useBookingSubmission({
    slug,
    customerProfile,
    onCustomerProfileResolved: setCustomerProfile,
    selectedServiceIds: selections.selectedServiceIds,
    selectedSlot: selections.selectedSlot,
    pickupAddress: pickup.pickupAddress,
    requiresPickupAddress: pickup.requiresPickupAddress,
    personalInfo: selections.personalInfo,
    addressSpec,
    resourcePicks: resourceSelections,
    durationMinutes: selections.duration?.minutes,
    intakeFields:
      data.intakeSchema === null
        ? null
        : buildIntakeRequestFields(data.intakeSchema, selections.intake),
    locale,
    steps: flow.steps,
    resolveInvalidPickerStep: pickerRecovery.resolveInvalidPickerStep,
    onRoute,
    onSubmitStart: flow.clearErrors,
  });

  return {
    ...pickup,
    submission,
    isAuthenticatedCustomer: customerProfile !== null && customerProfile !== undefined,
  };
}

// "Próximo" on Step 1: fetch the intake schemas and resource options so the step list is final,
// then continue — unless a selected service has no pickable resource (it fails closed, on Step 1).
function useLeaveServicesStep(state: FormState) {
  const { selections, load, flow } = state;
  return async function leaveServicesStep() {
    flow.setError('services', null);
    const outcome = await load();
    if (outcome.kind === 'error') return;
    const unavailable = outcome.data.unavailableServiceIds;
    if (selections.selectedServices.some((service) => unavailable.includes(service.id))) return;
    const next = resolveBookingSteps({
      services: selections.selectedServices,
      hasIntake: outcome.data.intakeSchema !== null,
    })[1];
    if (next) flow.goTo(next);
  };
}

// Owns the booking form's behaviour so BookingForm only renders the current step.
export function useBookingFormController(params: Params) {
  const state = useBookingFormState(params);
  const pickerRecovery = usePickerRecovery(state);
  const submit = useBookingFormSubmit(params, state, pickerRecovery);
  const leaveServicesStep = useLeaveServicesStep(state);
  const { selections, flow } = state;

  return {
    ...submit,
    flow,
    selections,
    bookable: state.bookable,
    formData: state.data,
    resourceSelections: state.resourceSelections,
    pickerStatus: pickerRecovery.pickerFetchFailed ? ('error' as const) : ('ready' as const),
    retryPickerOptions: pickerRecovery.retryPickerOptions,
    leaveServicesStep,
    toggleService: (serviceId: string) => {
      selections.toggleService(serviceId);
      flow.clearErrors();
    },
    pick: (requirement: HotsiteServiceResourceOptionsRequirement, resourceId: string) => {
      selections.setPicks(
        setPick(selections.picks, toResourceSelectionItem(requirement, resourceId)),
      );
      flow.clearErrors();
    },
    chooseDuration: (minutes: number) => {
      selections.chooseDuration(minutes);
      flow.setError('duration', null);
    },
    selectDate: (date: string) => {
      selections.selectDate(date);
      flow.setError('availability', null);
    },
    selectSlot: (slot: Parameters<typeof selections.selectSlot>[0]) => {
      selections.selectSlot(slot);
      flow.setError('availability', null);
    },
  };
}
