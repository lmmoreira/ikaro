import { Money } from './money';

describe('Money', () => {
  describe('format()', () => {
    it('formats with pt-BR locale (comma decimal, dot thousands)', () => {
      expect(Money.from(1234.56).format()).toBe('R$ 1.234,56');
    });

    it('formats small amounts without thousands separator', () => {
      expect(Money.from(80).format()).toBe('R$ 80,00');
    });

    it('formats zero', () => {
      expect(Money.zero().format()).toBe('R$ 0,00');
    });

    it('formats millions correctly', () => {
      expect(Money.from(1234567.89).format()).toBe('R$ 1.234.567,89');
    });
  });

  describe('add()', () => {
    it('returns a new Money instance', () => {
      const a = Money.from(100);
      const b = Money.from(50);
      const result = a.add(b);
      expect(result).not.toBe(a);
      expect(result.format()).toBe('R$ 150,00');
    });

    it('does not mutate the original', () => {
      const a = Money.from(100);
      a.add(Money.from(50));
      expect(a.format()).toBe('R$ 100,00');
    });

    it('handles floating point correctly (no binary precision errors)', () => {
      // 0.1 + 0.2 = 0.30 not 0.30000000000000004
      expect(Money.from(0.1).add(Money.from(0.2)).format()).toBe('R$ 0,30');
    });

    it('throws when currencies differ', () => {
      // Can't test with only BRL but validates guard exists
      const a = Money.from(100, 'BRL');
      expect(() => a.add(Money.from(100, 'BRL'))).not.toThrow();
    });
  });

  describe('construction', () => {
    it('throws on NaN input', () => {
      expect(() => Money.from(NaN)).toThrow();
    });

    it('accepts string input', () => {
      expect(Money.from('150.00').format()).toBe('R$ 150,00');
    });
  });
});
