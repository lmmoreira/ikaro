import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { findFirstMatchingSlot, slotMatchesCriteria } from './availability-alert-matching.helpers';
import { AvailabilityAlertCriteria } from './availability-alert.types';

const TZ = 'America/Sao_Paulo'; // UTC-3, no DST since 2019

const slot = (startIso: string, endIso: string) => ({
  startsAt: new Date(startIso),
  endsAt: new Date(endIso),
});

describe('slotMatchesCriteria', () => {
  describe('ONE_TIME_RANGE', () => {
    const criteria: AvailabilityAlertCriteria = {
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: new Date('2026-11-10T13:00:00Z'),
      acceptableEndAt: new Date('2026-11-10T17:00:00Z'),
    };

    it('matches a slot starting inside the range, the range start included', () => {
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z')),
      ).toBe(true);
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T16:30:00Z', '2026-11-10T17:30:00Z')),
      ).toBe(true);
    });

    it('rejects a slot starting at the range end or outside it', () => {
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T17:00:00Z', '2026-11-10T18:00:00Z')),
      ).toBe(false);
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T12:30:00Z', '2026-11-10T13:30:00Z')),
      ).toBe(false);
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-11T13:00:00Z', '2026-11-11T14:00:00Z')),
      ).toBe(false);
    });

    it('rejects an empty slot', () => {
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T14:00:00Z', '2026-11-10T14:00:00Z')),
      ).toBe(false);
    });
  });

  describe('WEEKLY_PREFERENCE', () => {
    // Mondays and Wednesdays, starting between 09:00 and 12:00 local.
    const criteria: AvailabilityAlertCriteria = {
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['monday', 'wednesday'],
      localStartTime: TimeOfDay.create('09:00'),
      localEndTime: TimeOfDay.create('12:00'),
    };

    it('matches on a listed weekday when the local start is inside the window (timezone-converted)', () => {
      // 2026-11-09 is a Monday; 12:00Z is 09:00 in São Paulo.
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z')),
      ).toBe(true);
    });

    it('rejects a slot on an unlisted local weekday', () => {
      // 2026-11-10 is a Tuesday; 12:00Z is 09:00 local.
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-10T12:00:00Z', '2026-11-10T13:00:00Z')),
      ).toBe(false);
    });

    it('derives the weekday locally, not from the UTC date', () => {
      // Wednesday 2026-11-11 02:00Z is Tuesday 23:00 locally: the UTC weekday matches, the local does not.
      const wide: AvailabilityAlertCriteria = {
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: ['wednesday'],
        localStartTime: TimeOfDay.create('00:00'),
        localEndTime: TimeOfDay.create('23:59'),
      };
      expect(
        slotMatchesCriteria(wide, TZ, slot('2026-11-11T02:00:00Z', '2026-11-11T03:00:00Z')),
      ).toBe(false);
      // Monday 2026-11-09 23:00 local is Tuesday 02:00Z: the local weekday matches, the UTC does not.
      const monday: AvailabilityAlertCriteria = {
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: ['monday'],
        localStartTime: TimeOfDay.create('22:00'),
        localEndTime: TimeOfDay.create('23:59'),
      };
      expect(
        slotMatchesCriteria(monday, TZ, slot('2026-11-10T02:00:00Z', '2026-11-10T03:00:00Z')),
      ).toBe(true);
    });

    it('rejects a slot starting before the window or at/after its end', () => {
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-09T11:30:00Z', '2026-11-09T12:30:00Z')),
      ).toBe(false);
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-09T15:00:00Z', '2026-11-09T16:00:00Z')),
      ).toBe(false);
    });

    it('accepts a slot starting at the window start and one starting just before its end', () => {
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-09T12:00:00Z', '2026-11-09T13:00:00Z')),
      ).toBe(true);
      expect(
        slotMatchesCriteria(criteria, TZ, slot('2026-11-09T14:30:00Z', '2026-11-09T15:30:00Z')),
      ).toBe(true);
    });
  });
});

describe('findFirstMatchingSlot', () => {
  const criteria: AvailabilityAlertCriteria = {
    criteriaType: 'ONE_TIME_RANGE',
    acceptableStartAt: new Date('2026-11-10T13:00:00Z'),
    acceptableEndAt: new Date('2026-11-10T17:00:00Z'),
  };

  it('returns the earliest matching slot regardless of input order', () => {
    const later = slot('2026-11-10T15:00:00Z', '2026-11-10T16:00:00Z');
    const earlier = slot('2026-11-10T13:30:00Z', '2026-11-10T14:30:00Z');
    expect(findFirstMatchingSlot(criteria, TZ, [later, earlier])).toEqual(earlier);
  });

  it('returns null when nothing matches', () => {
    expect(
      findFirstMatchingSlot(criteria, TZ, [slot('2026-11-12T13:00:00Z', '2026-11-12T14:00:00Z')]),
    ).toBeNull();
    expect(findFirstMatchingSlot(criteria, TZ, [])).toBeNull();
  });
});
