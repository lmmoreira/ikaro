import { clampAdvanceDaysToBookableUntil, daysUntilBookableUntil } from './bookable-until-days';

const SP = 'America/Sao_Paulo';
// Thursday 10 Dec 2026, 12:00 in São Paulo.
const NOW = new Date('2026-12-10T15:00:00.000Z');

describe('bookable-until day counts (M26-S18b)', () => {
  describe('daysUntilBookableUntil', () => {
    it.each([
      { cap: '2026-12-15', days: 5 },
      { cap: '2026-12-11', days: 1 },
      { cap: '2026-12-10', days: 0 },
      { cap: '2026-12-01', days: 0 },
    ])('counts $days whole days to $cap, floored at 0', ({ cap, days }) => {
      expect(daysUntilBookableUntil(cap, SP, NOW)).toBe(days);
    });

    it('counts from the tenant-local today, not the UTC day, late in the evening', () => {
      // 23:30 on the 10th in São Paulo is already the 11th in UTC.
      const lateEvening = new Date('2026-12-11T02:30:00Z');

      expect(daysUntilBookableUntil('2026-12-15', SP, lateEvening)).toBe(5);
      expect(daysUntilBookableUntil('2026-12-15', 'UTC', lateEvening)).toBe(4);
    });
  });

  describe('clampAdvanceDaysToBookableUntil', () => {
    it.each([
      { max: 90, cap: '2026-12-15', clamped: 5 },
      { max: 3, cap: '2026-12-15', clamped: 3 },
      { max: 90, cap: '2026-12-10', clamped: 0 },
      { max: 90, cap: null, clamped: 90 },
      { max: 90, cap: undefined, clamped: 90 },
      { max: 90, cap: '', clamped: 90 },
    ])('clamps $max with the cap "$cap" to $clamped', ({ max, cap, clamped }) => {
      expect(clampAdvanceDaysToBookableUntil(max, cap, SP, NOW)).toBe(clamped);
    });
  });
});
