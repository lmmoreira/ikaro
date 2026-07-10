import { LoyaltyErrorCode } from '@ikaro/types';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyDomainError,
  LoyaltyInsufficientPointsError,
  LoyaltyInvalidPointsError,
} from './loyalty-domain.error';

describe('LoyaltyDomainError (base class)', () => {
  it('sets name, code, field and is a real Error instance', () => {
    const err = new LoyaltyDomainError(
      'something went wrong',
      LoyaltyErrorCode.INVALID_POINTS,
      'someField',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LoyaltyDomainError);
    expect(err.name).toBe('LoyaltyDomainError');
    expect(err.code).toBe(LoyaltyErrorCode.INVALID_POINTS);
    expect(err.field).toBe('someField');
    expect(err.message).toBe('something went wrong');
  });

  it('leaves field undefined when not provided', () => {
    const err = new LoyaltyDomainError('x', LoyaltyErrorCode.INVALID_POINTS);
    expect(err.field).toBeUndefined();
  });
});

describe('loyalty domain error subclasses', () => {
  const cases: Array<{
    label: string;
    build: () => LoyaltyDomainError;
    code: LoyaltyErrorCode;
  }> = [
    {
      label: 'LoyaltyInvalidPointsError',
      build: () => new LoyaltyInvalidPointsError(),
      code: LoyaltyErrorCode.INVALID_POINTS,
    },
    {
      label: 'LoyaltyInsufficientPointsError',
      build: () => new LoyaltyInsufficientPointsError(),
      code: LoyaltyErrorCode.INSUFFICIENT_POINTS,
    },
    {
      label: 'LoyaltyBalanceNotFoundError',
      build: () => new LoyaltyBalanceNotFoundError(),
      code: LoyaltyErrorCode.BALANCE_NOT_FOUND,
    },
  ];

  it.each(cases)('$label extends LoyaltyDomainError and carries its code', ({ build, code }) => {
    const err = build();
    expect(err).toBeInstanceOf(LoyaltyDomainError);
    expect(err.code).toBe(code);
  });
});
