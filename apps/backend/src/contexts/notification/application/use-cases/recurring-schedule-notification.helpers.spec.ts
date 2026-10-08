import {
  buildScheduleSummaryVariables,
  formatCalendarDate,
  formatLocalDateTime,
  formatWeekdays,
} from './recurring-schedule-notification.helpers';

describe('recurring-schedule-notification.helpers', () => {
  describe('formatWeekdays', () => {
    it('lists the days Monday-first in the tenant locale, whatever order they arrive in', () => {
      expect(formatWeekdays(['sunday', 'wednesday', 'monday'], 'pt-BR')).toBe(
        'segunda-feira, quarta-feira e domingo',
      );
      expect(formatWeekdays(['sunday', 'wednesday', 'monday'], 'en')).toBe(
        'Monday, Wednesday, and Sunday',
      );
    });

    it('names a single day without a conjunction', () => {
      expect(formatWeekdays(['saturday'], 'pt-BR')).toBe('sábado');
    });

    it('ignores a day it does not know', () => {
      expect(formatWeekdays(['funday', 'friday'], 'en')).toBe('Friday');
    });
  });

  describe('formatCalendarDate', () => {
    it('formats a YYYY-MM-DD date in the locale without shifting it by a timezone', () => {
      expect(formatCalendarDate('2026-09-01', 'pt-BR')).toBe('01/09/2026');
      expect(formatCalendarDate('2026-09-01', 'en')).toBe('09/01/2026');
    });
  });

  describe('formatLocalDateTime', () => {
    it('converts the instant to the tenant timezone before formatting', () => {
      expect(formatLocalDateTime('2026-09-03T02:30:00.000Z', 'America/Sao_Paulo', 'pt-BR')).toBe(
        '02/09/2026 23:30',
      );
    });
  });

  describe('buildScheduleSummaryVariables', () => {
    it('keeps the start time as the tenant-local HH:mm it already is', () => {
      expect(
        buildScheduleSummaryVariables(
          {
            daysOfWeek: ['tuesday'],
            startTime: '10:00',
            startsOn: '2026-09-01',
            endsOn: '2026-11-24',
          },
          'pt-BR',
        ),
      ).toEqual({
        weekdays: 'terça-feira',
        localTime: '10:00',
        startsOn: '01/09/2026',
        endsOn: '24/11/2026',
      });
    });
  });
});
