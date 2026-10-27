'use client';

import { useMemo, useState } from 'react';
import { BookingErrorCode } from '@ikaro/types';
import type {
  Address,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { filterBookableServices } from '@/features/booking/model/bookable-services';
import type { BookingDeepLinkSeed } from '@/features/booking/model/booking-deep-link';
import { isAddressBlank } from '@/features/booking/model/personal-info';
import {
  PUBLIC_BOOKING_STEP_PLAN,
  pickerStepId,
  resolvePickerUnits,
  type BookingStepId,
  type BookingStepPlan,
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
import { useSeededResourcePick } from './useSeededResourcePick';

export interface BookingFormCoreParams {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  /** The step list the flow builds; the public plan unless the flow (the staff one) has its own. */
  readonly stepPlan?: BookingStepPlan;
  /** What the availability-alert email's link pre-selects; null on the plain booking page. */
  readonly seed?: BookingDeepLinkSeed | null;
  /** The pickup address a service starts with until staff or the customer edit it. */
  readonly defaultAddress: Address | null | undefined;
  /** Where a 401 goes: each flow sends its own user to its own login. */
  readonly onLogin: () => void;
}

// A refusal that says the chosen time cannot be booked: the slot is dropped, so the customer
// picks again from a list the date step reloads on reopening instead of resubmitting it.
const CLEARS_SLOT = new Set<string>([
  BookingErrorCode.SLOT_UNAVAILABLE,
  BookingErrorCode.SLOT_CLOSED,
  BookingErrorCode.OUTSIDE_BUSINESS_HOURS,
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

// The selections, the step list they produce and the fetch that finalises it.
function useBookingFormState({ slug, services, seed, stepPlan }: BookingFormCoreParams) {
  const bookable = useMemo(() => filterBookableServices(services), [services]);
  const selections = useBookingSelections(bookable, seed ?? null);
  const { selectedServices, picks, selectedServiceIds } = selections;
  const { data, load, refetchOptions } = useBookingFormData({ slug, selectedServices });
  const hasUnavailable = selectedServices.some((s) => data.unavailableServiceIds.includes(s.id));
  const flow = useBookingFlow({
    selectedServices,
    resolved: data.status === 'ready' && !hasUnavailable,
    hasIntake: data.intakeSchema !== null,
    stepPlan,
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

// The pickup address defaults to the saved one until it is edited.
function usePickupAddress(state: FormState, defaultAddress: Address | null | undefined) {
  const { selections } = state;
  const [edited, setEdited] = useState(false);
  const requiresPickupAddress = selections.selectedServices.some((s) => s.requiresPickupAddress);
  const pickupAddress: Address =
    requiresPickupAddress &&
    !edited &&
    isAddressBlank(selections.personalInfo.pickupAddress) &&
    defaultAddress
      ? defaultAddress
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

// Where an error returns the user to: a step of the list, or the flow's own login for a 401.
function useErrorRouting(state: FormState, onLogin: () => void) {
  const { selections, flow } = state;
  return function handleRoute(resolved: ResolvedErrorStep) {
    if (resolved.kind === 'login') {
      onLogin();
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

// "Próximo" on Step 1: fetch the intake schemas and resource options so the step list is final,
// then continue — unless a selected service has no pickable resource (it fails closed, on Step 1).
function useLeaveServicesStep(state: FormState, params: BookingFormCoreParams) {
  const { selections, load, flow } = state;
  const stepPlan = params.stepPlan ?? PUBLIC_BOOKING_STEP_PLAN;
  const seedResourcePick = useSeededResourcePick(selections, params.seed ?? null);
  return async function leaveServicesStep() {
    flow.setError('services', null);
    const outcome = await load();
    if (outcome.kind === 'error') return;
    const unavailable = outcome.data.unavailableServiceIds;
    if (selections.selectedServices.some((service) => unavailable.includes(service.id))) return;
    seedResourcePick(outcome.data.requirements);
    const next = stepPlan.resolve({
      services: selections.selectedServices,
      hasIntake: outcome.data.intakeSchema !== null,
    })[1];
    if (next) flow.goTo(next);
  };
}

type FormSelections = FormState['selections'];

// The handlers that keep the selections and the flow's errors consistent: changing a choice clears
// the errors that belonged to the previous one.
function formHandlers(selections: FormSelections, flow: FormState['flow']) {
  return {
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
    selectSlot: (slot: Parameters<FormSelections['selectSlot']>[0]) => {
      selections.selectSlot(slot);
      flow.setError('availability', null);
    },
  };
}

// What the hotsite and the staff booking flows share: the selections, the step list, the picker
// recovery, the pickup default, the error routing and the handlers that keep them consistent.
// Each flow adds its own submit and its own source of the customer (useBookingFormController,
// useStaffBookingFormController); nothing here knows which flow it serves.
export function useBookingFormCore(params: BookingFormCoreParams) {
  const state = useBookingFormState(params);
  const pickerRecovery = usePickerRecovery(state);
  const pickup = usePickupAddress(state, params.defaultAddress);
  const onRoute = useErrorRouting(state, params.onLogin);
  const leaveServicesStep = useLeaveServicesStep(state, params);
  const { selections, flow } = state;

  return {
    ...pickup,
    flow,
    selections,
    bookable: state.bookable,
    formData: state.data,
    resourceSelections: state.resourceSelections,
    pickerStatus: pickerRecovery.pickerFetchFailed ? ('error' as const) : ('ready' as const),
    retryPickerOptions: pickerRecovery.retryPickerOptions,
    resolveInvalidPickerStep: pickerRecovery.resolveInvalidPickerStep,
    onRoute,
    leaveServicesStep,
    ...formHandlers(selections, flow),
  };
}
