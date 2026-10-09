import { HttpStatus } from '@nestjs/common';
import { BookingDomainError } from '../../domain/errors/booking-domain.error';
import {
  RecurringBookingScheduleIneligibleServiceError,
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleNoOccurrencesError,
  RecurringBookingScheduleTermExceededError,
} from '../../domain/errors/recurring-booking-schedule.error';

type BookingDomainErrorCtor = new (...args: never[]) => BookingDomainError;

// Status per recurring-schedule request the customer can fix themselves (UC-070 A6, A7, A9),
// spread into booking-error.mapper.ts's STATUS_BY_ERROR_GROUP — kept in its own file so the mapper
// stays under docs/CODE_STANDARDS.md's file-length limit. All 422: the term (reversed, too long, or
// holding no occurrence at all) or the service is not acceptable for a recurring schedule.
export const RECURRING_SCHEDULE_REQUEST_ERROR_GROUPS: [BookingDomainErrorCtor[], HttpStatus][] = [
  [
    [
      RecurringBookingScheduleIneligibleServiceError,
      RecurringBookingScheduleInvalidDateRangeError,
      RecurringBookingScheduleNoOccurrencesError,
      RecurringBookingScheduleTermExceededError,
    ],
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
];
