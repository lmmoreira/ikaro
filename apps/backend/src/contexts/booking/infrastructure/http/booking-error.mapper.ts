import { HttpException, HttpStatus } from '@nestjs/common';
import { ProblemDetail } from '../../../../shared/http/problem-detail';
import {
  BookingDomainError,
  ServiceDeactivatedError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';

export function mapBookingError(err: unknown): never {
  if (err instanceof ServiceNotFoundError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Not Found',
      status: HttpStatus.NOT_FOUND,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.NOT_FOUND);
  }
  if (err instanceof ServiceDeactivatedError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Conflict',
      status: HttpStatus.CONFLICT,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.CONFLICT);
  }
  if (err instanceof BookingDomainError) {
    const body: ProblemDetail = {
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      detail: err.message,
    };
    throw new HttpException(body, HttpStatus.BAD_REQUEST);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
