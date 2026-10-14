import {
  DEFAULT_BOOKING_STEPS,
  resolveBookingSteps,
  type BookingStepId,
  type BookingStepPlan,
  type ResolveBookingStepsInput,
} from './booking-steps';

// The staff flow has no personal step: the contact comes from the customer chooser and the staff
// body takes no photos (UC-108). Everything else — the pickers, the duration, the intake — is the
// public flow's own list, so a rule added to resolveBookingSteps() reaches staff with no change.
function withoutPersonal(steps: readonly BookingStepId[]): BookingStepId[] {
  return steps.filter((stepId) => stepId !== 'personal');
}

export function resolveStaffBookingSteps(input: ResolveBookingStepsInput): BookingStepId[] {
  return withoutPersonal(resolveBookingSteps(input));
}

export const STAFF_BOOKING_STEP_PLAN: BookingStepPlan = {
  initial: withoutPersonal(DEFAULT_BOOKING_STEPS),
  resolve: resolveStaffBookingSteps,
};
