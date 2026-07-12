import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyDomainError,
  LoyaltyInsufficientPointsError,
  LoyaltyInvalidPointsError,
} from '../../domain/errors/loyalty-domain.error';

export function mapLoyaltyError(err: unknown): never {
  if (err instanceof LoyaltyBalanceNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (err instanceof LoyaltyInsufficientPointsError || err instanceof LoyaltyInvalidPointsError) {
    throw throwProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field);
  }
  if (err instanceof LoyaltyDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
