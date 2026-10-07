import { describe, expect, it } from 'vitest';
import {
  buildAvailabilityAlertRequest,
  initialAvailabilityAlertForm,
  validateAvailabilityAlertForm,
  type AvailabilityAlertFormState,
} from './availability-alert-form';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-10-06T15:00:00.000Z');
const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000001';

const range = (
  overrides: Partial<AvailabilityAlertFormState> = {},
): AvailabilityAlertFormState => ({
  ...initialAvailabilityAlertForm,
  criteriaType: 'ONE_TIME_RANGE',
  rangeFrom: '2026-10-20T09:00',
  rangeTo: '2026-10-27T18:00',
  ...overrides,
});

const weekly = (
  overrides: Partial<AvailabilityAlertFormState> = {},
): AvailabilityAlertFormState => ({
  ...initialAvailabilityAlertForm,
  criteriaType: 'WEEKLY_PREFERENCE',
  weekdays: ['tuesday', 'thursday'],
  weeklyFrom: '09:00',
  weeklyTo: '12:00',
  ...overrides,
});

describe('validateAvailabilityAlertForm() — one-time range', () => {
  it('accepts a range that ends in the future', () => {
    expect(validateAvailabilityAlertForm(range(), TZ, NOW)).toEqual({});
  });

  it('asks for both ends', () => {
    expect(validateAvailabilityAlertForm(range({ rangeFrom: '' }), TZ, NOW)).toEqual({
      rangeFrom: 'rangeFromRequired',
    });
    expect(validateAvailabilityAlertForm(range({ rangeTo: '' }), TZ, NOW)).toEqual({
      rangeTo: 'rangeToRequired',
    });
  });

  it('rejects an end that is not after the start', () => {
    expect(validateAvailabilityAlertForm(range({ rangeTo: '2026-10-18T18:00' }), TZ, NOW)).toEqual({
      rangeTo: 'rangeEnd',
    });
    expect(validateAvailabilityAlertForm(range({ rangeTo: '2026-10-20T09:00' }), TZ, NOW)).toEqual({
      rangeTo: 'rangeEnd',
    });
  });

  it('says a time does not exist when it falls in a spring-forward gap, instead of calling it empty', () => {
    const early = new Date('2026-01-01T00:00:00.000Z');

    expect(
      validateAvailabilityAlertForm(
        range({ rangeFrom: '2026-03-08T02:30', rangeTo: '2026-03-09T10:00' }),
        'America/New_York',
        early,
      ),
    ).toEqual({ rangeFrom: 'rangeFromInvalid' });
    expect(
      validateAvailabilityAlertForm(
        range({ rangeFrom: '2026-03-07T10:00', rangeTo: '2026-03-08T02:30' }),
        'America/New_York',
        early,
      ),
    ).toEqual({ rangeTo: 'rangeToInvalid' });
  });

  it('rejects a range that ends in the past, in the tenant timezone', () => {
    expect(
      validateAvailabilityAlertForm(
        range({ rangeFrom: '2026-09-28T09:00', rangeTo: '2026-10-01T18:00' }),
        TZ,
        NOW,
      ),
    ).toEqual({ rangeTo: 'rangePast' });
  });

  it('judges "past" by the tenant wall clock, not the browser — 12:00 local is 15:00Z', () => {
    // NOW is 12:00 in Sao Paulo: an end of 11:59 today is already past, 12:01 is not.
    const sameDay = { rangeFrom: '2026-10-06T08:00' };
    expect(
      validateAvailabilityAlertForm(range({ ...sameDay, rangeTo: '2026-10-06T11:59' }), TZ, NOW),
    ).toEqual({
      rangeTo: 'rangePast',
    });
    expect(
      validateAvailabilityAlertForm(range({ ...sameDay, rangeTo: '2026-10-06T12:01' }), TZ, NOW),
    ).toEqual({});
  });
});

describe('validateAvailabilityAlertForm() — weekly preference', () => {
  it('accepts weekdays with an end time after the start time', () => {
    expect(validateAvailabilityAlertForm(weekly(), TZ, NOW)).toEqual({});
  });

  it('asks for at least one weekday', () => {
    expect(validateAvailabilityAlertForm(weekly({ weekdays: [] }), TZ, NOW)).toEqual({
      weekdays: 'weekdaysEmpty',
    });
  });

  it('rejects an end time that is not after the start time', () => {
    expect(
      validateAvailabilityAlertForm(weekly({ weeklyFrom: '12:00', weeklyTo: '09:00' }), TZ, NOW),
    ).toEqual({ weeklyTo: 'weeklyEnd' });
    expect(
      validateAvailabilityAlertForm(weekly({ weeklyFrom: '09:00', weeklyTo: '09:00' }), TZ, NOW),
    ).toEqual({ weeklyTo: 'weeklyEnd' });
  });

  it('reports every weekly problem at once', () => {
    expect(
      validateAvailabilityAlertForm(
        weekly({ weekdays: [], weeklyFrom: '12:00', weeklyTo: '09:00' }),
        TZ,
        NOW,
      ),
    ).toEqual({ weekdays: 'weekdaysEmpty', weeklyTo: 'weeklyEnd' });
  });

  it('asks for both times', () => {
    expect(validateAvailabilityAlertForm(weekly({ weeklyFrom: '' }), TZ, NOW)).toEqual({
      weeklyFrom: 'weeklyFromRequired',
    });
    expect(validateAvailabilityAlertForm(weekly({ weeklyTo: '' }), TZ, NOW)).toEqual({
      weeklyTo: 'weeklyToRequired',
    });
  });
});

describe('buildAvailabilityAlertRequest()', () => {
  const params = { serviceId: SERVICE_ID, preferredResourceId: null, durationMinutes: null };

  it('builds a one-time range body with the tenant offset and no expiry for the default', () => {
    expect(buildAvailabilityAlertRequest(range(), params, TZ, NOW)).toEqual({
      serviceId: SERVICE_ID,
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: '2026-10-20T09:00:00-03:00',
      acceptableEndAt: '2026-10-27T18:00:00-03:00',
    });
  });

  it('builds a weekly body with weekdays in calendar order and the HH:MM times', () => {
    const body = buildAvailabilityAlertRequest(
      weekly({ weekdays: ['thursday', 'tuesday'] }),
      params,
      TZ,
      NOW,
    );

    expect(body).toEqual({
      serviceId: SERVICE_ID,
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['tuesday', 'thursday'],
      localStartTime: '09:00',
      localEndTime: '12:00',
    });
  });

  it('carries the resource pick and the duration from the booking flow', () => {
    const body = buildAvailabilityAlertRequest(
      range(),
      { serviceId: SERVICE_ID, preferredResourceId: RESOURCE_ID, durationMinutes: 90 },
      TZ,
      NOW,
    );

    expect(body).toMatchObject({ preferredResourceId: RESOURCE_ID, durationMinutes: 90 });
  });

  it('sends an expiry only when the customer picked a non-default one', () => {
    const body = buildAvailabilityAlertRequest(range({ expiryDays: 60 }), params, TZ, NOW);

    expect(body.expiresAt).toBe('2026-12-05T15:00:00.000Z');
  });

  it('never sends a participant count or a timezone', () => {
    const body = buildAvailabilityAlertRequest(range(), params, TZ, NOW);

    expect(body).not.toHaveProperty('participantCount');
    expect(body).not.toHaveProperty('timezone');
  });
});
