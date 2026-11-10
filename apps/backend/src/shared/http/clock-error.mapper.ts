import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { ClockOffsetLimitError } from '../domain/clock-offset-limit.error';

export function mapClockError(err: unknown): never {
  if (err instanceof ClockOffsetLimitError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, 'days');
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
