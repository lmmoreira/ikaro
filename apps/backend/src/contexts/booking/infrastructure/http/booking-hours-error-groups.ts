import { HttpStatus } from '@nestjs/common';
import {
  BookingDomainError,
  BookingOutsideBusinessHoursError,
  BookingSlotClosedError,
} from '../../domain/errors/booking-domain.error';

type BookingDomainErrorCtor = new (...args: never[]) => BookingDomainError;

// Status for a booking whose start the business is closed for (UC-001 A10), spread into
// booking-error.mapper.ts's STATUS_BY_ERROR_GROUP — kept in its own file so the mapper stays under
// docs/CODE_STANDARDS.md's file-length limit. 409, like a taken slot: the schedule, not the request
// shape, refuses it, and the caller picks another time.
export const BOOKING_HOURS_ERROR_GROUPS: [BookingDomainErrorCtor[], HttpStatus][] = [
  [[BookingSlotClosedError, BookingOutsideBusinessHoursError], HttpStatus.CONFLICT],
];
