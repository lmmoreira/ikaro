// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatCurrencySymbol, formatMoney } from './format-money';

describe('formatMoney', () => {
  it('formats BRL with pt-BR locale', () => {
    expect(formatMoney(100, 'pt-BR', 'BRL')).toBe('R$ 100,00');
  });

  it('formats USD with en locale', () => {
    expect(formatMoney(100, 'en', 'USD')).toBe('$100.00');
  });

  it('formats thousands with correct separators for pt-BR', () => {
    expect(formatMoney(1234.5, 'pt-BR', 'BRL')).toBe('R$ 1.234,50');
  });

  it('normalizes non-breaking space to regular space', () => {
    const result = formatMoney(150, 'pt-BR', 'BRL');
    expect(result.charCodeAt(2)).toBe(32); // regular space after R$
    expect(result).toBe('R$ 150,00');
  });

  it('formats zero', () => {
    expect(formatMoney(0, 'pt-BR', 'BRL')).toBe('R$ 0,00');
  });

  it('extracts the currency symbol for the locale', () => {
    expect(formatCurrencySymbol('pt-BR', 'BRL')).toBe('R$');
    expect(formatCurrencySymbol('en', 'USD')).toBe('$');
  });
});
