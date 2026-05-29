import { HttpStatus } from '@nestjs/common';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyInsufficientPointsError,
} from '../../domain/errors/loyalty-domain.error';
import { mapLoyaltyError } from './loyalty-error.mapper';

describe('mapLoyaltyError', () => {
  it('maps LoyaltyBalanceNotFoundError to 404', () => {
    let caught: unknown;
    try {
      mapLoyaltyError(new LoyaltyBalanceNotFoundError());
    } catch (err) {
      caught = err;
    }
    expect((caught as { status: number }).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps LoyaltyInsufficientPointsError to 422', () => {
    let caught: unknown;
    try {
      mapLoyaltyError(new LoyaltyInsufficientPointsError());
    } catch (err) {
      caught = err;
    }
    expect((caught as { status: number }).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps unknown errors to 500', () => {
    let caught: unknown;
    try {
      mapLoyaltyError(new Error('oops'));
    } catch (err) {
      caught = err;
    }
    expect((caught as { status: number }).status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
