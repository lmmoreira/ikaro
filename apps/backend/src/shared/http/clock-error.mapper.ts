import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { ClockAdvanceOutOfRangeError } from '../domain/clock-advance-out-of-range.error';

export function mapClockError(err: unknown): never {
  if (err instanceof ClockAdvanceOutOfRangeError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, 'days');
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
