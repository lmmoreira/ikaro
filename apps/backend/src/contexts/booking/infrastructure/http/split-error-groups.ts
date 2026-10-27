import { HttpStatus } from '@nestjs/common';
import { BookingDomainError } from '../../domain/errors/booking-domain.error';
import { AVAILABILITY_ALERT_ERROR_GROUPS } from './availability-alert-error-groups';
import { BOOKING_HOURS_ERROR_GROUPS } from './booking-hours-error-groups';
import { RECURRING_SCHEDULE_REQUEST_ERROR_GROUPS } from './recurring-schedule-error-groups';

type BookingDomainErrorCtor = new (...args: never[]) => BookingDomainError;

// Every status group that lives in its own file, in the order booking-error.mapper.ts matches them
// (first match wins), so the mapper takes one spread instead of one import and one spread per file
// and stays under docs/CODE_STANDARDS.md's file-length limit.
export const SPLIT_ERROR_GROUPS: [BookingDomainErrorCtor[], HttpStatus][] = [
  ...AVAILABILITY_ALERT_ERROR_GROUPS,
  ...RECURRING_SCHEDULE_REQUEST_ERROR_GROUPS,
  ...BOOKING_HOURS_ERROR_GROUPS,
];
