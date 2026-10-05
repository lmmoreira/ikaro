import {
  CreateAvailabilityAlertBodySchema,
  UpdateAvailabilityAlertBodySchema,
} from './availability-alerts.schemas';

const SERVICE_ID = '00000000-0000-4000-8000-000000000002';

const weekly = {
  serviceId: SERVICE_ID,
  criteriaType: 'WEEKLY_PREFERENCE' as const,
  weekdays: ['tuesday' as const, 'thursday' as const],
  localStartTime: '18:00',
  localEndTime: '20:00',
};

const range = {
  serviceId: SERVICE_ID,
  criteriaType: 'ONE_TIME_RANGE' as const,
  acceptableStartAt: '2026-10-10T14:00:00.000Z',
  acceptableEndAt: '2026-10-10T18:00:00.000Z',
};

describe('CreateAvailabilityAlertBodySchema', () => {
  it('accepts a weekly preference and a one-time range', () => {
    expect(CreateAvailabilityAlertBodySchema.safeParse(weekly).success).toBe(true);
    expect(CreateAvailabilityAlertBodySchema.safeParse(range).success).toBe(true);
  });

  it('accepts the optional matching fields, including a null resource preference', () => {
    const result = CreateAvailabilityAlertBodySchema.safeParse({
      ...weekly,
      preferredResourceId: null,
      durationMinutes: 90,
      participantCount: 3,
      expiresAt: '2026-11-01T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an unknown criteria type, a missing service and a non-uuid service', () => {
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, criteriaType: 'MONTHLY' }).success,
    ).toBe(false);
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, serviceId: undefined }).success,
    ).toBe(false);
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, serviceId: 'nope' }).success,
    ).toBe(false);
  });

  it('rejects an empty weekday list, an unknown weekday and a malformed local time', () => {
    expect(CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, weekdays: [] }).success).toBe(
      false,
    );
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, weekdays: ['someday'] }).success,
    ).toBe(false);
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, localStartTime: '25:00' }).success,
    ).toBe(false);
  });

  it('rejects a non-ISO instant and a non-positive duration or participant count', () => {
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...range, acceptableStartAt: 'tomorrow' })
        .success,
    ).toBe(false);
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, durationMinutes: 0 }).success,
    ).toBe(false);
    expect(
      CreateAvailabilityAlertBodySchema.safeParse({ ...weekly, participantCount: -1 }).success,
    ).toBe(false);
  });

  it('does not accept a client-supplied timezone as part of the contract', () => {
    const result = CreateAvailabilityAlertBodySchema.safeParse({
      ...weekly,
      timezone: 'Asia/Tokyo',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('timezone');
  });
});

describe('UpdateAvailabilityAlertBodySchema', () => {
  it('accepts any single field', () => {
    expect(UpdateAvailabilityAlertBodySchema.safeParse({ durationMinutes: 60 }).success).toBe(true);
    expect(UpdateAvailabilityAlertBodySchema.safeParse({ weekdays: ['monday'] }).success).toBe(
      true,
    );
    expect(UpdateAvailabilityAlertBodySchema.safeParse({ preferredResourceId: null }).success).toBe(
      true,
    );
  });

  it('rejects an empty body', () => {
    expect(UpdateAvailabilityAlertBodySchema.safeParse({}).success).toBe(false);
  });

  it('still validates each field it is given', () => {
    expect(UpdateAvailabilityAlertBodySchema.safeParse({ weekdays: [] }).success).toBe(false);
    expect(UpdateAvailabilityAlertBodySchema.safeParse({ criteriaType: 'MONTHLY' }).success).toBe(
      false,
    );
  });
});
