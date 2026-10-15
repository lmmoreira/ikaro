import type { SchedulingExceptionItem } from '@ikaro/types';

// Test builder for the worklist item: defaults to a confirmed customer booking in a week, with one
// alternative. `booking: null` is the "booking could not be read" shape.
export function makeSchedulingException(
  overrides: Partial<Omit<SchedulingExceptionItem, 'booking'>> & {
    id?: string;
    booking?: Partial<NonNullable<SchedulingExceptionItem['booking']>> | null;
  } = {},
): SchedulingExceptionItem {
  const { booking, id = 'exc-1', ...rest } = overrides;
  return {
    id,
    sourceType: 'RESOURCE_DEACTIVATION',
    sourceId: 'res-box-2',
    affectedType: 'BOOKING',
    affectedId: `bk-${id}`,
    status: 'OPEN',
    alternatives: [{ resourceId: 'res-box-1', resourceName: 'Box 1' }],
    createdAt: '2026-10-14T12:00:00.000Z',
    booking:
      booking === null
        ? null
        : {
            contactName: 'João Silva',
            scheduledAt: '2026-12-10T13:00:00.000Z',
            totalDurationMins: 30,
            serviceNames: ['Lavagem Simples'],
            status: 'APPROVED',
            resourceName: 'Box 2',
            isCustomer: true,
            totalPrice: { amount: 60, currency: 'BRL' },
            ...booking,
          },
    ...rest,
  };
}
