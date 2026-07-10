import { HttpException, HttpStatus } from '@nestjs/common';
import { LoyaltyErrorCode } from '@ikaro/types';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyDomainError,
  LoyaltyInsufficientPointsError,
  LoyaltyInvalidPointsError,
} from '../../domain/errors/loyalty-domain.error';
import { mapLoyaltyError } from './loyalty-error.mapper';

function call(err: unknown): HttpException {
  try {
    mapLoyaltyError(err);
    throw new Error('mapLoyaltyError should have thrown');
  } catch (e) {
    return e as HttpException;
  }
}

describe('mapLoyaltyError', () => {
  it('maps LoyaltyBalanceNotFoundError to 404 with code', () => {
    const err = call(new LoyaltyBalanceNotFoundError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toMatchObject({ code: LoyaltyErrorCode.BALANCE_NOT_FOUND });
  });

  it('maps LoyaltyInsufficientPointsError to 422 with code', () => {
    const err = call(new LoyaltyInsufficientPointsError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toMatchObject({ code: LoyaltyErrorCode.INSUFFICIENT_POINTS });
  });

  it('maps LoyaltyInvalidPointsError to 422 with code (regression: previously fell through to 500)', () => {
    const err = call(new LoyaltyInvalidPointsError());
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toMatchObject({ code: LoyaltyErrorCode.INVALID_POINTS });
  });

  it('maps generic LoyaltyDomainError to 400, preserving the code carried on the instance', () => {
    const err = call(
      new LoyaltyDomainError('some unmapped condition', LoyaltyErrorCode.INVALID_POINTS),
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(err.getResponse()).toMatchObject({ code: LoyaltyErrorCode.INVALID_POINTS });
  });

  it('rethrows plain Error unchanged (regression: previously collapsed to 500)', () => {
    const original = new Error('unexpected');
    expect(() => mapLoyaltyError(original)).toThrow(original);
  });

  it('wraps unknown non-Error values in Error', () => {
    expect(() => mapLoyaltyError('string error')).toThrow(Error);
  });
});
