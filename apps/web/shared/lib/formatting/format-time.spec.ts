import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateLong,
  formatMonthYear,
  formatMonthYearRange,
  formatTime,
} from './format-time';

describe('formatTime', () => {
  it('formats a UTC date as HH:mm in America/Sao_Paulo (24h)', () => {
    expect(
      formatTime(new Date('2026-06-15T12:00:00.000Z'), 'pt-BR', 'America/Sao_Paulo', '24h'),
    ).toBe('09:00');
  });

  it('pads single-digit hours', () => {
    expect(
      formatTime(new Date('2026-06-15T08:05:00.000Z'), 'pt-BR', 'America/Sao_Paulo', '24h'),
    ).toBe('05:05');
  });

  it('uses 12h format for en locale', () => {
    const result = formatTime(
      new Date('2026-06-15T14:00:00.000Z'),
      'en',
      'America/New_York',
      '12h',
    );
    expect(result).toMatch(/10:00/);
    expect(result).toMatch(/AM|PM/i);
  });
});

describe('formatDate', () => {
  it('formats DD/MM/YYYY for BR dateFormat', () => {
    // Use noon UTC to stay unambiguously on June 15 in any UTC-offset timezone
    expect(formatDate(new Date('2026-06-15T12:00:00Z'), 'America/Sao_Paulo', 'DD/MM/YYYY')).toBe(
      '15/06/2026',
    );
  });

  it('formats MM/DD/YYYY for US dateFormat', () => {
    expect(formatDate(new Date('2026-06-15T12:00:00Z'), 'America/New_York', 'MM/DD/YYYY')).toBe(
      '06/15/2026',
    );
  });

  it('formats YYYY-MM-DD for ISO dateFormat', () => {
    expect(formatDate(new Date('2026-06-15T12:00:00Z'), 'UTC', 'YYYY-MM-DD')).toBe('2026-06-15');
  });
});

describe('formatDateLong', () => {
  it('formats a date in pt-BR long format, capitalized', () => {
    expect(formatDateLong(new Date('2026-06-15T00:00:00Z'), 'pt-BR')).toBe(
      'Segunda-feira, 15 de junho',
    );
  });

  it('formats a date in en long format', () => {
    const result = formatDateLong(new Date('2026-06-15T00:00:00Z'), 'en');
    expect(result).toMatch(/Monday/);
    expect(result).toMatch(/June/);
    expect(result).toMatch(/15/);
  });
});

describe('formatMonthYear', () => {
  it('returns capitalized month + year for pt-BR', () => {
    expect(formatMonthYear(new Date('2026-06-16T00:00:00'), 'pt-BR')).toBe('Junho 2026');
  });

  it('returns English month + year for en locale', () => {
    expect(formatMonthYear(new Date('2026-01-01T00:00:00'), 'en')).toBe('January 2026');
  });

  it('capitalizes the first letter regardless of locale output', () => {
    const result = formatMonthYear(new Date('2026-06-16T00:00:00'), 'pt-BR');
    expect(result.charAt(0)).toBe(result.charAt(0).toUpperCase());
  });
});

describe('formatMonthYearRange', () => {
  const d = (iso: string): Date => new Date(`${iso}T00:00:00`);

  it('keeps the single month label when the range stays in one month', () => {
    expect(formatMonthYearRange(d('2026-10-05'), d('2026-10-18'), 'pt-BR')).toBe('Outubro 2026');
    expect(formatMonthYearRange(d('2026-10-05'), d('2026-10-18'), 'en')).toBe('October 2026');
  });

  it('shows both months and one year when crossing a month in the same year', () => {
    expect(formatMonthYearRange(d('2026-10-31'), d('2026-11-13'), 'pt-BR')).toBe(
      'Outubro – Novembro 2026',
    );
    expect(formatMonthYearRange(d('2026-10-31'), d('2026-11-13'), 'en')).toBe(
      'October – November 2026',
    );
  });

  it('shows both years when crossing a year boundary', () => {
    expect(formatMonthYearRange(d('2026-12-28'), d('2027-01-10'), 'pt-BR')).toBe(
      'Dezembro 2026 – Janeiro 2027',
    );
    expect(formatMonthYearRange(d('2026-12-28'), d('2027-01-10'), 'en')).toBe(
      'December 2026 – January 2027',
    );
  });
});
