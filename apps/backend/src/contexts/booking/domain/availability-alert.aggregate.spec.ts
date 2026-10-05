import { AvailabilityAlertBuilder } from '../../../test/builders/booking/index';
import { TimeOfDayValidationError } from '../../../shared/value-objects/time-of-day.vo';
import { TimezoneValidationError } from '../../../shared/value-objects/timezone.vo';
import {
  ALERT_DEFAULT_EXPIRY_DAYS,
  ALERT_MAX_EXPIRY_DAYS,
  AvailabilityAlert,
  CreateAvailabilityAlertOptions,
} from './availability-alert.aggregate';
import {
  AvailabilityAlertCriteriaInvalidError,
  AvailabilityAlertNotEditableError,
} from './errors/availability-alert.error';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const NOW = new Date('2026-10-05T12:00:00.000Z');
const at = (ms: number): Date => new Date(NOW.getTime() + ms);

function rangeOptions(
  overrides: Partial<CreateAvailabilityAlertOptions> = {},
): CreateAvailabilityAlertOptions {
  return {
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    serviceId: 'service-1',
    preferredResourceId: null,
    timezone: 'America/Sao_Paulo',
    criteria: {
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: at(2 * DAY_MS),
      acceptableEndAt: at(2 * DAY_MS + 4 * HOUR_MS),
    },
    durationMinutes: 120,
    participantCount: 2,
    expiresAt: null,
    correlationId: 'corr-1',
    now: NOW,
    ...overrides,
  };
}

function weeklyOptions(
  criteria: Partial<CreateAvailabilityAlertOptions['criteria']> = {},
  overrides: Partial<CreateAvailabilityAlertOptions> = {},
): CreateAvailabilityAlertOptions {
  return rangeOptions({
    criteria: {
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['tuesday', 'thursday'],
      localStartTime: '18:00',
      localEndTime: '20:00',
      ...criteria,
    },
    ...overrides,
  });
}

function reasonOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof AvailabilityAlertCriteriaInvalidError ? err.reason : String(err);
  }
  return undefined;
}

describe('AvailabilityAlert', () => {
  describe('create()', () => {
    it('creates an ACTIVE one-time-range alert and publishes AvailabilityAlertCreated', () => {
      const alert = AvailabilityAlert.create(rangeOptions());

      expect(alert.status).toBe('ACTIVE');
      expect(alert.criteria.criteriaType).toBe('ONE_TIME_RANGE');
      expect(alert.timezone).toBe('America/Sao_Paulo');
      expect(alert.version).toBeUndefined();
      const [event] = alert.domainEvents;
      expect(event.eventName).toBe('AvailabilityAlertCreated');
      expect(event.tenantId).toBe('tenant-1');
      expect(event.correlationId).toBe('corr-1');
      expect(event.data).toEqual({
        alertId: alert.id,
        customerId: 'customer-1',
        serviceId: 'service-1',
        criteriaType: 'ONE_TIME_RANGE',
        expiresAt: alert.expiresAt.toISOString(),
      });
    });

    it('creates a weekly-preference alert, de-duplicating the weekdays', () => {
      const alert = AvailabilityAlert.create(
        weeklyOptions({ weekdays: ['tuesday', 'tuesday', 'thursday'] }),
      );

      expect(alert.criteria).toMatchObject({
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: ['tuesday', 'thursday'],
      });
      expect(
        alert.criteria.criteriaType === 'WEEKLY_PREFERENCE' && alert.criteria.localStartTime.value,
      ).toBe('18:00');
    });

    it('rejects a range that carries weekly fields (both representations)', () => {
      expect(
        reasonOf(() =>
          AvailabilityAlert.create(
            rangeOptions({
              criteria: {
                criteriaType: 'ONE_TIME_RANGE',
                acceptableStartAt: at(DAY_MS),
                acceptableEndAt: at(DAY_MS + HOUR_MS),
                weekdays: ['monday'],
              },
            }),
          ),
        ),
      ).toBe('criteria-fields-mismatch');
    });

    it('rejects a range missing its end (neither representation complete)', () => {
      expect(
        reasonOf(() =>
          AvailabilityAlert.create(
            rangeOptions({
              criteria: { criteriaType: 'ONE_TIME_RANGE', acceptableStartAt: at(DAY_MS) },
            }),
          ),
        ),
      ).toBe('criteria-fields-mismatch');
    });

    it('rejects a weekly preference that carries range fields', () => {
      expect(
        reasonOf(() => AvailabilityAlert.create(weeklyOptions({ acceptableStartAt: at(DAY_MS) }))),
      ).toBe('criteria-fields-mismatch');
    });

    it('rejects a weekly preference missing its times', () => {
      expect(
        reasonOf(() => AvailabilityAlert.create(weeklyOptions({ localEndTime: undefined }))),
      ).toBe('criteria-fields-mismatch');
    });

    it('rejects a range whose end is not after its start', () => {
      expect(
        reasonOf(() =>
          AvailabilityAlert.create(
            rangeOptions({
              criteria: {
                criteriaType: 'ONE_TIME_RANGE',
                acceptableStartAt: at(2 * DAY_MS),
                acceptableEndAt: at(2 * DAY_MS),
              },
            }),
          ),
        ),
      ).toBe('range-end-before-start');
    });

    it('rejects a range that has already ended', () => {
      expect(
        reasonOf(() =>
          AvailabilityAlert.create(
            rangeOptions({
              criteria: {
                criteriaType: 'ONE_TIME_RANGE',
                acceptableStartAt: at(-2 * HOUR_MS),
                acceptableEndAt: at(-HOUR_MS),
              },
            }),
          ),
        ),
      ).toBe('range-in-past');
    });

    it('rejects a weekly preference with no weekday', () => {
      expect(reasonOf(() => AvailabilityAlert.create(weeklyOptions({ weekdays: [] })))).toBe(
        'weekdays-empty',
      );
    });

    it('rejects a weekly preference whose end time is not after its start', () => {
      expect(
        reasonOf(() =>
          AvailabilityAlert.create(
            weeklyOptions({ localStartTime: '20:00', localEndTime: '20:00' }),
          ),
        ),
      ).toBe('weekly-end-before-start');
    });

    it('rejects an invalid timezone', () => {
      expect(() => AvailabilityAlert.create(rangeOptions({ timezone: 'Mars/Olympus' }))).toThrow(
        TimezoneValidationError,
      );
    });

    it('rejects a malformed local time', () => {
      expect(() => AvailabilityAlert.create(weeklyOptions({ localStartTime: '25:99' }))).toThrow(
        TimeOfDayValidationError,
      );
    });

    describe('expiry', () => {
      it('defaults a weekly alert to 30 days after creation', () => {
        const alert = AvailabilityAlert.create(weeklyOptions());

        expect(alert.expiresAt).toEqual(at(ALERT_DEFAULT_EXPIRY_DAYS * DAY_MS));
      });

      it('clamps the default expiry to the end of a range that closes sooner', () => {
        const alert = AvailabilityAlert.create(rangeOptions());

        expect(alert.expiresAt).toEqual(at(2 * DAY_MS + 4 * HOUR_MS));
      });

      it('keeps the default 30 days for a range that closes later', () => {
        const alert = AvailabilityAlert.create(
          rangeOptions({
            criteria: {
              criteriaType: 'ONE_TIME_RANGE',
              acceptableStartAt: at(40 * DAY_MS),
              acceptableEndAt: at(41 * DAY_MS),
            },
          }),
        );

        expect(alert.expiresAt).toEqual(at(ALERT_DEFAULT_EXPIRY_DAYS * DAY_MS));
      });

      it('takes a requested expiry up to the 90-day maximum', () => {
        const alert = AvailabilityAlert.create(
          weeklyOptions({}, { expiresAt: at(ALERT_MAX_EXPIRY_DAYS * DAY_MS) }),
        );

        expect(alert.expiresAt).toEqual(at(ALERT_MAX_EXPIRY_DAYS * DAY_MS));
      });

      it('rejects a requested expiry beyond 90 days', () => {
        expect(
          reasonOf(() =>
            AvailabilityAlert.create(
              weeklyOptions({}, { expiresAt: at(ALERT_MAX_EXPIRY_DAYS * DAY_MS + 1) }),
            ),
          ),
        ).toBe('expires-beyond-max');
      });

      it('rejects a requested expiry in the past', () => {
        expect(
          reasonOf(() => AvailabilityAlert.create(weeklyOptions({}, { expiresAt: at(-HOUR_MS) }))),
        ).toBe('expires-in-past');
      });

      it('clamps a requested expiry to the end of the range', () => {
        const alert = AvailabilityAlert.create(rangeOptions({ expiresAt: at(30 * DAY_MS) }));

        expect(alert.expiresAt).toEqual(at(2 * DAY_MS + 4 * HOUR_MS));
      });
    });
  });

  describe('update()', () => {
    it('changes the numeric criteria and publishes AvailabilityAlertUpdated', () => {
      const alert = new AvailabilityAlertBuilder().build();

      alert.update({ durationMinutes: 90, participantCount: null }, 'corr-2', NOW);

      expect(alert.durationMinutes).toBe(90);
      expect(alert.participantCount).toBeNull();
      const [event] = alert.domainEvents;
      expect(event.eventName).toBe('AvailabilityAlertUpdated');
      expect(event.correlationId).toBe('corr-2');
    });

    it('overlays a partial patch on the current criteria of the same type', () => {
      const alert = new AvailabilityAlertBuilder()
        .withWeeklyPreference(['tuesday'], '18:00', '20:00')
        .withCreatedAt(NOW)
        .withExpiresAt(at(7 * DAY_MS))
        .build();

      alert.update({ criteria: { weekdays: ['friday'] } }, 'corr-2', NOW);

      expect(alert.criteria).toMatchObject({
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: ['friday'],
      });
      expect(
        alert.criteria.criteriaType === 'WEEKLY_PREFERENCE' && alert.criteria.localEndTime.value,
      ).toBe('20:00');
    });

    it('switches the criteria type when the patch carries the new type in full', () => {
      const alert = new AvailabilityAlertBuilder().withCreatedAt(NOW).build();

      alert.update(
        {
          criteria: {
            criteriaType: 'WEEKLY_PREFERENCE',
            weekdays: ['monday'],
            localStartTime: '09:00',
            localEndTime: '10:00',
          },
        },
        'corr-2',
        NOW,
      );

      expect(alert.criteria.criteriaType).toBe('WEEKLY_PREFERENCE');
    });

    it('refuses a switch that would carry nothing over from the old type', () => {
      const alert = new AvailabilityAlertBuilder().withCreatedAt(NOW).build();

      expect(
        reasonOf(() =>
          alert.update({ criteria: { criteriaType: 'WEEKLY_PREFERENCE' } }, 'corr-2', NOW),
        ),
      ).toBe('criteria-fields-mismatch');
    });

    it('refuses to leave both representations: weekly fields patched onto a range alert', () => {
      const alert = new AvailabilityAlertBuilder().withCreatedAt(NOW).build();

      expect(
        reasonOf(() => alert.update({ criteria: { weekdays: ['monday'] } }, 'corr-2', NOW)),
      ).toBe('criteria-fields-mismatch');
    });

    it('keeps the current expiry when none is requested, re-clamping it to a new range end', () => {
      const alert = new AvailabilityAlertBuilder()
        .withCreatedAt(NOW)
        .withExpiresAt(at(20 * DAY_MS))
        .build();

      alert.update(
        {
          criteria: {
            acceptableStartAt: at(DAY_MS),
            acceptableEndAt: at(DAY_MS + 2 * HOUR_MS),
          },
        },
        'corr-2',
        NOW,
      );

      expect(alert.expiresAt).toEqual(at(DAY_MS + 2 * HOUR_MS));
    });

    it('measures the 90-day maximum from creation, not from the edit', () => {
      const createdAt = at(-60 * DAY_MS);
      const alert = new AvailabilityAlertBuilder()
        .withWeeklyPreference(['monday'], '09:00', '10:00')
        .withCreatedAt(createdAt)
        .withExpiresAt(at(10 * DAY_MS))
        .build();

      expect(reasonOf(() => alert.update({ expiresAt: at(31 * DAY_MS) }, 'corr-2', NOW))).toBe(
        'expires-beyond-max',
      );
      alert.update({ expiresAt: at(30 * DAY_MS) }, 'corr-2', NOW);
      expect(alert.expiresAt).toEqual(at(30 * DAY_MS));
    });

    it.each(['NOTIFIED', 'EXPIRED', 'CANCELLED'] as const)(
      'refuses to edit a %s alert (read-only history)',
      (status) => {
        const alert = new AvailabilityAlertBuilder().withStatus(status).build();

        expect(() => alert.update({ durationMinutes: 30 }, 'corr-2', NOW)).toThrow(
          AvailabilityAlertNotEditableError,
        );
      },
    );

    it('refuses to edit an ACTIVE alert already past its expiry (the job has not run yet)', () => {
      const alert = new AvailabilityAlertBuilder().withExpiresAt(at(-HOUR_MS)).build();

      expect(() => alert.update({ durationMinutes: 30 }, 'corr-2', NOW)).toThrow(
        AvailabilityAlertNotEditableError,
      );
    });
  });

  describe('cancel()', () => {
    it('cancels an ACTIVE alert and publishes AvailabilityAlertCancelled', () => {
      const alert = new AvailabilityAlertBuilder().build();

      expect(alert.cancel('corr-3')).toBe(true);

      expect(alert.status).toBe('CANCELLED');
      expect(alert.domainEvents.map((e) => e.eventName)).toEqual(['AvailabilityAlertCancelled']);
    });

    it('is a no-op on an already-cancelled alert', () => {
      const alert = new AvailabilityAlertBuilder().withStatus('CANCELLED').build();

      expect(alert.cancel('corr-3')).toBe(false);
      expect(alert.domainEvents).toHaveLength(0);
    });

    it('refuses to cancel an ACTIVE alert already past its expiry (the job has not run yet)', () => {
      const alert = new AvailabilityAlertBuilder().withExpiresAt(at(-HOUR_MS)).build();

      expect(() => alert.cancel('corr-3', NOW)).toThrow(AvailabilityAlertNotEditableError);
      expect(alert.status).toBe('ACTIVE');
      expect(alert.domainEvents).toHaveLength(0);
    });

    it('stays idempotent on an already-cancelled alert even past its expiry', () => {
      const alert = new AvailabilityAlertBuilder()
        .withStatus('CANCELLED')
        .withExpiresAt(at(-HOUR_MS))
        .build();

      expect(alert.cancel('corr-3', NOW)).toBe(false);
    });

    it.each(['NOTIFIED', 'EXPIRED'] as const)('refuses to cancel a %s alert', (status) => {
      const alert = new AvailabilityAlertBuilder().withStatus(status).build();

      expect(() => alert.cancel('corr-3')).toThrow(AvailabilityAlertNotEditableError);
    });
  });

  describe('expire()', () => {
    it('moves an ACTIVE alert to EXPIRED and publishes AvailabilityAlertExpired', () => {
      const alert = new AvailabilityAlertBuilder().build();

      alert.expire('corr-4');

      expect(alert.status).toBe('EXPIRED');
      expect(alert.domainEvents.map((e) => e.eventName)).toEqual(['AvailabilityAlertExpired']);
    });

    it.each(['NOTIFIED', 'CANCELLED', 'EXPIRED'] as const)(
      'refuses to expire a %s alert',
      (status) => {
        const alert = new AvailabilityAlertBuilder().withStatus(status).build();

        expect(() => alert.expire('corr-4')).toThrow(AvailabilityAlertNotEditableError);
      },
    );
  });

  describe('markPersisted()', () => {
    it('records the persisted version', () => {
      const alert = AvailabilityAlert.create(rangeOptions());

      alert.markPersisted(1);

      expect(alert.version).toBe(1);
    });
  });
});
