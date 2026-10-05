import { HttpStatus } from '@nestjs/common';
import {
  AvailabilityAlertCapReachedError,
  AvailabilityAlertCriteriaInvalidError,
  AvailabilityAlertIneligibleServiceError,
  AvailabilityAlertNotEditableError,
  AvailabilityAlertNotFoundError,
} from '../../domain/errors/availability-alert.error';
import { BookingDomainError } from '../../domain/errors/booking-domain.error';

type BookingDomainErrorCtor = new (...args: never[]) => BookingDomainError;

// Status per availability-alert error (UC-072/UC-076), spread into booking-error.mapper.ts's
// STATUS_BY_ERROR_GROUP — kept in its own file so the mapper stays under
// docs/CODE_STANDARDS.md's file-length limit. An unknown or foreign alert is 404; a state
// conflict (not editable, cap reached) is 409; a request the customer can fix is 422.
export const AVAILABILITY_ALERT_ERROR_GROUPS: [BookingDomainErrorCtor[], HttpStatus][] = [
  [[AvailabilityAlertNotFoundError], HttpStatus.NOT_FOUND],
  [[AvailabilityAlertNotEditableError, AvailabilityAlertCapReachedError], HttpStatus.CONFLICT],
  [
    [AvailabilityAlertCriteriaInvalidError, AvailabilityAlertIneligibleServiceError],
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
];
