import {
  formatEmailDate,
  formatEmailDateTime,
  formatEmailInstant,
  formatEmailTime,
  formatWeekdays,
  labelledLine,
  sentence,
} from './notification-email-format.helpers';

describe('notification-email-format.helpers', () => {
  describe('formatEmailDate', () => {
    it.each([
      ['DD/MM/YYYY', '09/10/2026'],
      ['MM/DD/YYYY', '10/09/2026'],
      ['YYYY-MM-DD', '2026-10-09'],
    ] as const)('writes 2026-10-09 as %s -> %s', (format, expected) => {
      expect(formatEmailDate('2026-10-09', format)).toBe(expected);
    });
  });

  describe('formatEmailTime', () => {
    it('keeps a 24-hour clock as is', () => {
      expect(formatEmailTime('14:05', '24h')).toBe('14:05');
    });

    it.each([
      ['00:00', '12:00 AM'],
      ['00:30', '12:30 AM'],
      ['09:15', '9:15 AM'],
      ['12:00', '12:00 PM'],
      ['14:05', '2:05 PM'],
      ['23:59', '11:59 PM'],
    ])('writes %s on a 12-hour clock as %s', (hhmm, expected) => {
      expect(formatEmailTime(hhmm, '12h')).toBe(expected);
    });
  });

  describe('formatEmailInstant / formatEmailDateTime', () => {
    it('converts the instant to the tenant timezone before formatting', () => {
      const formats = { dateFormat: 'DD/MM/YYYY', timeFormat: '24h' } as const;
      expect(formatEmailInstant('2026-09-03T02:30:00.000Z', 'America/Sao_Paulo', formats)).toEqual({
        date: '02/09/2026',
        time: '23:30',
      });
      expect(formatEmailDateTime('2026-09-03T15:30:00.000Z', 'America/Sao_Paulo', formats)).toBe(
        '03/09/2026 12:30',
      );
    });

    it('follows the tenant formats', () => {
      expect(
        formatEmailDateTime('2026-09-03T15:30:00.000Z', 'America/New_York', {
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
        }),
      ).toBe('09/03/2026 11:30 AM');
    });
  });

  describe('formatWeekdays', () => {
    it('lists the days Monday-first in the tenant language, whatever order they arrive in', () => {
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

  describe('labelledLine', () => {
    it('renders a labelled paragraph with both parts escaped', () => {
      expect(labelledLine('Reason:', 'Slot <b>taken</b> & gone')).toBe(
        '<p><strong>Reason:</strong> Slot &lt;b&gt;taken&lt;/b&gt; &amp; gone</p>',
      );
    });

    it.each([null, undefined, '', '   '])('renders nothing for the value %p', (value) => {
      expect(labelledLine('Reason:', value)).toBe('');
    });
  });

  describe('sentence', () => {
    it('escapes catalog text before it goes into the HTML body', () => {
      expect(sentence('Cancelled by <the> customer')).toBe('Cancelled by &lt;the&gt; customer');
    });
  });
});
