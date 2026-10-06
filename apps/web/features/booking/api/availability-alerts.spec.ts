import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvailabilityAlertResponse, CreateAvailabilityAlertRequest } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { ApiError } from '@/shared/lib/api/errors';
import { createAvailabilityAlert } from './availability-alerts';

// One shared MockAdapter per file — see public.spec.ts for why a second one would orphan this one.
const mock = new MockAdapter(bffClient);

const request: CreateAvailabilityAlertRequest = {
  serviceId: '10000000-0000-4000-8000-000000000001',
  criteriaType: 'ONE_TIME_RANGE',
  acceptableStartAt: '2026-10-20T09:00:00-03:00',
  acceptableEndAt: '2026-10-27T18:00:00-03:00',
};

const created: AvailabilityAlertResponse = {
  id: '30000000-0000-4000-8000-000000000001',
  serviceId: request.serviceId,
  preferredResourceId: null,
  criteriaType: 'ONE_TIME_RANGE',
  timezone: 'America/Sao_Paulo',
  acceptableStartAt: '2026-10-20T12:00:00.000Z',
  acceptableEndAt: '2026-10-27T21:00:00.000Z',
  weekdays: null,
  localStartTime: null,
  localEndTime: null,
  durationMinutes: null,
  participantCount: null,
  status: 'ACTIVE',
  expiresAt: '2026-11-05T15:00:00.000Z',
  createdAt: '2026-10-06T15:00:00.000Z',
};

describe('createAvailabilityAlert', () => {
  afterEach(() => mock.reset());

  it('posts the body to /availability-alerts and returns the created alert', async () => {
    mock.onPost('/availability-alerts').reply(201, created);

    const result = await createAvailabilityAlert(request);

    expect(result).toEqual(created);
    expect(mock.history.post?.[0]?.data).toBe(JSON.stringify(request));
  });

  it('throws an ApiError carrying the problem code on a 409 (cap reached)', async () => {
    mock.onPost('/availability-alerts').reply(409, { code: 'BOOKING_ALERT_CAP_REACHED' });

    await expect(createAvailabilityAlert(request)).rejects.toBeInstanceOf(ApiError);
    await expect(createAvailabilityAlert(request)).rejects.toMatchObject({
      status: 409,
      data: { code: 'BOOKING_ALERT_CAP_REACHED' },
    });
  });
});
