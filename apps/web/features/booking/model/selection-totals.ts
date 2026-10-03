import type { HotsiteServiceResponse } from '@ikaro/types';

export function isPerTimeService(service: HotsiteServiceResponse): boolean {
  return service.bookingPolicy.pricingPolicy === 'PER_TIME_INCREMENT';
}

// What a per-time service costs at the least: its minimum charge, or one increment.
export function perTimeFromAmount(service: HotsiteServiceResponse): number {
  const { minimumChargeAmount, pricePerIncrementAmount } = service.bookingPolicy;
  return minimumChargeAmount ?? pricePerIncrementAmount ?? service.price.amount;
}

export interface SelectionTotals {
  readonly amount: number;
  /** Duration of the fixed-duration services only; a customer-selected one is not known yet. */
  readonly durationMinutes: number;
  /** True while any selected service is priced per time: the amount is a floor, not the total. */
  readonly isFloor: boolean;
}

export function summarizeSelection(selected: readonly HotsiteServiceResponse[]): SelectionTotals {
  const perTime = selected.filter(isPerTimeService);
  const fixed = selected.filter((service) => !isPerTimeService(service));
  return {
    amount:
      fixed.reduce((sum, service) => sum + service.price.amount, 0) +
      perTime.reduce((sum, service) => sum + perTimeFromAmount(service), 0),
    durationMinutes: fixed.reduce((sum, service) => sum + service.durationMinutes, 0),
    isFloor: perTime.length > 0,
  };
}
