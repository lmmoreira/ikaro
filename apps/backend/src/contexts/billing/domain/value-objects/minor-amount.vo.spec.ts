import { MinorAmountValidationError } from '../errors/billing-domain.error';
import { MinorAmount } from './minor-amount.vo';

describe('MinorAmount', () => {
  it('builds from an integer amount and an ISO currency', () => {
    const amount = MinorAmount.create(4900, 'BRL');

    expect(amount.amountMinor).toBe(4900);
    expect(amount.currency).toBe('BRL');
  });

  it.each(['BRL', 'USD', 'EUR'])('accepts the real ISO currency %s', (currency) => {
    expect(MinorAmount.create(100, currency).currency).toBe(currency);
  });

  it('accepts zero', () => {
    expect(MinorAmount.create(0, 'BRL').amountMinor).toBe(0);
  });

  it.each([49.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])(
    'rejects a fractional or unsafe amount (%s)',
    (value) => {
      expect(() => MinorAmount.create(value, 'BRL')).toThrow(MinorAmountValidationError);
    },
  );

  it('rejects a negative amount', () => {
    expect(() => MinorAmount.create(-1, 'BRL')).toThrow(MinorAmountValidationError);
  });

  it.each(['', 'br', 'BRLL', 'B1L', 'R$', 'ZZZ', 'QQQ'])(
    'rejects a non-ISO currency (%s)',
    (currency) => {
      expect(() => MinorAmount.create(100, currency)).toThrow(MinorAmountValidationError);
    },
  );

  it('reconstitute skips validation', () => {
    expect(MinorAmount.reconstitute(-5, 'x').amountMinor).toBe(-5);
  });

  it('compares by value', () => {
    expect(MinorAmount.create(100, 'USD').equals(MinorAmount.create(100, 'USD'))).toBe(true);
    expect(MinorAmount.create(100, 'USD').equals(MinorAmount.create(100, 'BRL'))).toBe(false);
  });
});
