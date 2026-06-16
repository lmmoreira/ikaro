import { describe, expect, it } from 'vitest';
import { formatDateBR, formatDateLongBR, formatTimeBR } from './format-time';

describe('formatTimeBR', () => {
  it('formats an ISO datetime as HH:mm in the America/Sao_Paulo timezone', () => {
    expect(formatTimeBR('2026-06-15T12:00:00.000Z')).toBe('09:00');
  });

  it('pads single-digit hours and minutes', () => {
    expect(formatTimeBR('2026-06-15T08:05:00.000Z')).toBe('05:05');
  });
});

describe('formatDateBR', () => {
  it('formats an ISO date as DD/MM/YYYY', () => {
    expect(formatDateBR('2026-06-15')).toBe('15/06/2026');
  });
});

describe('formatDateLongBR', () => {
  it('formats an ISO date as "Weekday, day de month" in pt-BR, capitalized', () => {
    expect(formatDateLongBR('2026-06-15')).toBe('Segunda-feira, 15 de junho');
    expect(formatDateLongBR('2026-06-18')).toBe('Quinta-feira, 18 de junho');
  });
});
