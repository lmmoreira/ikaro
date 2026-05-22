import { TimeOfDay } from './time-of-day.vo';

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

    it('throws for an invalid HH:MM value', () => {
      expect(() => TimeOfDay.create('25:00')).toThrow();
    });

    it('throws for an invalid HH:MM:SS value', () => {
      expect(() => TimeOfDay.create('24:00:00')).toThrow();
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
});
