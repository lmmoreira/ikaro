import { Money } from './money';

describe('Money', () => {
  describe('format()', () => {
    it('formats with pt-BR locale (comma decimal, dot thousands)', () => {
      expect(Money.from(1234.56, 'BRL').format('pt-BR', 'BRL')).toBe('R$ 1.234,56');
    });

    it('formats small amounts without thousands separator', () => {
      expect(Money.from(80, 'BRL').format('pt-BR', 'BRL')).toBe('R$ 80,00');
    });

    it('formats zero', () => {
      expect(Money.zero('BRL').format('pt-BR', 'BRL')).toBe('R$ 0,00');
    });

    it('formats millions correctly', () => {
      expect(Money.from(1234567.89, 'BRL').format('pt-BR', 'BRL')).toBe('R$ 1.234.567,89');
    });

    it('formats negative amounts with the sign before the thousands separator', () => {
      expect(Money.from(-1234.56, 'BRL').format('pt-BR', 'BRL')).toBe('-R$ 1.234,56');
    });

    it('formats small negative amounts without a thousands separator', () => {
      expect(Money.from(-80, 'BRL').format('pt-BR', 'BRL')).toBe('-R$ 80,00');
    });

    it('formats USD with en locale', () => {
      expect(Money.from(100, 'USD').format('en', 'USD')).toBe('$100.00');
    });
  });

  describe('add()', () => {
    it('returns a new Money instance', () => {
      const a = Money.from(100, 'BRL');
      const b = Money.from(50, 'BRL');
      const result = a.add(b);
      expect(result).not.toBe(a);
      expect(result.format('pt-BR', 'BRL')).toBe('R$ 150,00');
    });

    it('does not mutate the original', () => {
      const a = Money.from(100, 'BRL');
      a.add(Money.from(50, 'BRL'));
      expect(a.format('pt-BR', 'BRL')).toBe('R$ 100,00');
    });

    it('handles floating point correctly (no binary precision errors)', () => {
      // 0.1 + 0.2 = 0.30 not 0.30000000000000004
      expect(Money.from(0.1, 'BRL').add(Money.from(0.2, 'BRL')).format('pt-BR', 'BRL')).toBe(
        'R$ 0,30',
      );
    });

    it('throws when currencies differ', () => {
      const a = Money.from(100, 'BRL');
      const b = Money.from(100, 'USD');
      expect(() => a.add(b)).toThrow();
    });
  });

  describe('construction', () => {
    it('throws on NaN input', () => {
      expect(() => Money.from(NaN, 'BRL')).toThrow();
    });

    it('accepts string input', () => {
      expect(Money.from('150.00', 'BRL').format('pt-BR', 'BRL')).toBe('R$ 150,00');
    });
  });
});
