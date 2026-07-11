import { TimeOfDayErrorCode } from '@ikaro/types';
import { TimeOfDay, TimeOfDayValidationError } from './time-of-day.vo';

describe('TimeOfDay', () => {
  describe('isValid', () => {
    it('accepts valid HH:MM values', () => {
      expect(TimeOfDay.isValid('00:00')).toBe(true);
      expect(TimeOfDay.isValid('09:00')).toBe(true);
      expect(TimeOfDay.isValid('23:59')).toBe(true);
    });

    it('accepts HH:MM:SS by normalising to HH:MM before validation', () => {
      expect(TimeOfDay.isValid('09:00:00')).toBe(true);
      expect(TimeOfDay.isValid('23:59:59')).toBe(true);
      expect(TimeOfDay.isValid('00:00:00')).toBe(true);
    });

    it('rejects invalid HH:MM format', () => {
      expect(TimeOfDay.isValid('9:00')).toBe(false);
      expect(TimeOfDay.isValid('09:0')).toBe(false);
      expect(TimeOfDay.isValid('24:00')).toBe(false);
      expect(TimeOfDay.isValid('12:60')).toBe(false);
      expect(TimeOfDay.isValid('')).toBe(false);
      expect(TimeOfDay.isValid('noon')).toBe(false);
    });

    it('rejects out-of-range HH:MM:SS values', () => {
      expect(TimeOfDay.isValid('24:00:00')).toBe(false);
      expect(TimeOfDay.isValid('23:60:00')).toBe(false);
    });
  });

  describe('create', () => {
    it('returns a TimeOfDay with HH:MM value for a valid HH:MM input', () => {
      const t = TimeOfDay.create('09:30');
      expect(t.value).toBe('09:30');
    });

    it('accepts HH:MM:SS and stores only HH:MM', () => {
      const t = TimeOfDay.create('09:00:00');
      expect(t.value).toBe('09:00');
    });

    it('normalises non-zero seconds — domain has minute precision only', () => {
      const t = TimeOfDay.create('10:30:45');
      expect(t.value).toBe('10:30');
    });

    it('throws TimeOfDayValidationError with FORMAT_INVALID for an invalid HH:MM value', () => {
      expect(() => TimeOfDay.create('25:00')).toThrow(TimeOfDayValidationError);
      try {
        TimeOfDay.create('25:00');
      } catch (err) {
        expect((err as TimeOfDayValidationError).code).toBe(TimeOfDayErrorCode.FORMAT_INVALID);
      }
    });

    it('throws TimeOfDayValidationError with FORMAT_INVALID for an invalid HH:MM:SS value', () => {
      expect(() => TimeOfDay.create('24:00:00')).toThrow(TimeOfDayValidationError);
      try {
        TimeOfDay.create('24:00:00');
      } catch (err) {
        expect((err as TimeOfDayValidationError).code).toBe(TimeOfDayErrorCode.FORMAT_INVALID);
      }
    });
  });

  describe('isBefore', () => {
    it('returns correct comparison', () => {
      const open = TimeOfDay.create('09:00');
      const close = TimeOfDay.create('18:00');
      expect(open.isBefore(close)).toBe(true);
      expect(close.isBefore(open)).toBe(false);
    });

    it('returns false for equal times', () => {
      const t = TimeOfDay.create('12:00');
      expect(t.isBefore(TimeOfDay.create('12:00'))).toBe(false);
    });
  });

  describe('toMinutes', () => {
    it('converts 00:00 to 0', () => {
      expect(TimeOfDay.create('00:00').toMinutes()).toBe(0);
    });

    it('converts 09:00 to 540', () => {
      expect(TimeOfDay.create('09:00').toMinutes()).toBe(540);
    });

    it('converts 09:30 to 570', () => {
      expect(TimeOfDay.create('09:30').toMinutes()).toBe(570);
    });

    it('converts 23:59 to 1439', () => {
      expect(TimeOfDay.create('23:59').toMinutes()).toBe(1439);
    });
  });

  describe('fromMinutes', () => {
    it('converts 0 to 00:00', () => {
      expect(TimeOfDay.fromMinutes(0).value).toBe('00:00');
    });

    it('converts 540 to 09:00', () => {
      expect(TimeOfDay.fromMinutes(540).value).toBe('09:00');
    });

    it('converts 570 to 09:30', () => {
      expect(TimeOfDay.fromMinutes(570).value).toBe('09:30');
    });

    it('converts 1439 to 23:59', () => {
      expect(TimeOfDay.fromMinutes(1439).value).toBe('23:59');
    });
  });

  describe('addMinutes', () => {
    it('adds 30 minutes to 09:00 → 09:30', () => {
      expect(TimeOfDay.create('09:00').addMinutes(30).value).toBe('09:30');
    });

    it('adds 120 minutes to 09:00 → 11:00', () => {
      expect(TimeOfDay.create('09:00').addMinutes(120).value).toBe('11:00');
    });

    it('adds 0 minutes returns the same time', () => {
      expect(TimeOfDay.create('14:30').addMinutes(0).value).toBe('14:30');
    });

    it('adding across the hour boundary works correctly', () => {
      expect(TimeOfDay.create('09:45').addMinutes(30).value).toBe('10:15');
    });
  });
});
