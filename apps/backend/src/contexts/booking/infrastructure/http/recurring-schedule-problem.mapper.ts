import { HttpException, HttpStatus } from '@nestjs/common';
import {
  buildProblemDetail,
  ProblemDetail,
  RecurringScheduleConflictProblemDetail,
} from '@ikaro/types/protocol/errors';
import {
  RecurringBookingScheduleConflictError,
  RecurringBookingScheduleTermExceededError,
} from '../../domain/errors/recurring-booking-schedule.error';

// The two recurring-schedule creation refusals whose problem-details body carries more than
// { code, field } — split out of booking-error.mapper.ts to keep that file under the length cap.
// Throws for those two errors and returns for anything else, so mapBookingError() can call it
// first and fall through to its generic status-group lookup.
export function mapRecurringScheduleProblem(err: unknown): void {
  if (err instanceof RecurringBookingScheduleConflictError) throwConflictProblem(err);
  if (err instanceof RecurringBookingScheduleTermExceededError) throwTermExceededProblem(err);
}

// UC-070 A1: the 409 lists every occurrence that cannot be honored, as an extra `conflicts` member
// on the problem-details body (ProblemDetail allows extension members). An overlap refusal with
// no specific occurrences keeps the plain body.
function throwConflictProblem(err: RecurringBookingScheduleConflictError): never {
  const body: RecurringScheduleConflictProblemDetail = {
    ...buildProblemDetail(HttpStatus.CONFLICT, err.code, err.message),
    ...(err.conflicts.length > 0
      ? {
          conflicts: err.conflicts.map(({ occurrenceStart, reason }) => ({
            occurrenceStart: occurrenceStart.toISOString(),
            reason,
          })),
        }
      : {}),
  };
  throw new HttpException(body, HttpStatus.CONFLICT);
}

// UC-070 A6: forwards { maxTermDays, latestEndsOn } so the client can name the limit.
function throwTermExceededProblem(err: RecurringBookingScheduleTermExceededError): never {
  const body: ProblemDetail = {
    ...buildProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field),
    params: err.params,
  };
  throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
}
