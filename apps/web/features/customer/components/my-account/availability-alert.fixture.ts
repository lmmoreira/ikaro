import type { AvailabilityAlertResponse } from '@ikaro/types';

/** An ACTIVE one-time-range alert with no resource; override what a test cares about. */
export function makeAlert(
  overrides: Partial<AvailabilityAlertResponse> = {},
): AvailabilityAlertResponse {
  return {
    id: 'alert-1',
    serviceId: 'service-1',
    preferredResourceId: null,
    criteriaType: 'ONE_TIME_RANGE',
    timezone: 'America/Sao_Paulo',
    acceptableStartAt: '2026-10-20T12:00:00.000Z',
    acceptableEndAt: '2026-10-27T21:00:00.000Z',
    weekdays: null,
    localStartTime: null,
    localEndTime: null,
    durationMinutes: 60,
    participantCount: null,
    status: 'ACTIVE',
    expiresAt: '2026-11-05T15:00:00.000Z',
    createdAt: '2026-10-06T15:00:00.000Z',
    serviceName: 'Massagem relaxante',
    preferredResourceName: null,
    notifiedAt: null,
    ...overrides,
  };
}
