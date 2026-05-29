import { HttpException, HttpStatus } from '@nestjs/common';
import {
  LoyaltyBalanceNotFoundError,
  LoyaltyInsufficientPointsError,
} from '../../domain/errors/loyalty-domain.error';

export function mapLoyaltyError(err: unknown): never {
  if (err instanceof LoyaltyBalanceNotFoundError) {
    throw new HttpException(
      {
        type: 'about:blank',
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: err.message,
      },
      HttpStatus.NOT_FOUND,
    );
  }
  if (err instanceof LoyaltyInsufficientPointsError) {
    throw new HttpException(
      {
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        detail: err.message,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
  throw new HttpException(
    {
      type: 'about:blank',
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: err instanceof Error ? err.message : 'Unexpected error',
    },
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}
