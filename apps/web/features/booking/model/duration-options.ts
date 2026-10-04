import type { HotsiteServiceResponse } from '@ikaro/types';

/** A service whose duration the customer picks (`durationPolicy = CUSTOMER_SELECTED`). */
export function isCustomerSelectedDuration(service: HotsiteServiceResponse): boolean {
  return service.bookingPolicy.durationPolicy === 'CUSTOMER_SELECTED';
}

/** The basket's one customer-selected-duration service, if any (the API allows at most one). */
export function findVariableDurationService(
  services: readonly HotsiteServiceResponse[],
): HotsiteServiceResponse | null {
  return services.find(isCustomerSelectedDuration) ?? null;
}

/** The pickable durations: min..max in steps of the increment. Empty when the policy is incomplete. */
export function durationOptions(service: HotsiteServiceResponse): number[] {
  const {
    durationMinMinutes: min,
    durationMaxMinutes: max,
    durationIncrementMinutes: step,
  } = service.bookingPolicy;
  if (min === null || max === null || step === null || step <= 0 || max < min) return [];
  const options: number[] = [];
  for (let minutes = min; minutes <= max; minutes += step) options.push(minutes);
  return options;
}
