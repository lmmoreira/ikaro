import { AddressErrorCode, BookingErrorCode, CountryCodeErrorCode } from '@ikaro/types';
import {
  AvailabilityDateInPastError,
  AvailabilityRangeInvalidError,
  BookingAddressValidationError,
  BookingCustomerNotFoundError,
  BookingConcurrentModificationError,
  BookingDiscountDisabledError,
  BookingDiscountExceedsTotalError,
  BookingDiscountMismatchError,
  BookingDiscountNotAvailableError,
  BookingDomainError,
  BookingForbiddenError,
  BookingInfoMessageTooShortError,
  BookingLineRequiredError,
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
  BookingRejectionReasonTooShortError,
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  BookingSlotUnavailableError,
  CancellationWindowExpiredError,
  ClosureDateInPastError,
  ClosureReasonInvalidError,
  ClosureTimeRangeIncompleteError,
  CompleteBookingLinesIncompleteError,
  CreatedByRequiredError,
  CustomerPhoneNotSetError,
  DayAlreadyOpenInSettingsError,
  InvalidBookingTransitionError,
  InvalidTimeRangeError,
  OpeningDateInPastError,
  PickupAddressRequiredError,
  ScheduleAlreadyClosedError,
  ScheduleClosureNotFoundError,
  ScheduleOpeningAlreadyExistsError,
  ScheduleOpeningNotFoundError,
  ServiceDeactivatedError,
  ServiceDurationInvalidError,
  ServiceLoyaltyPointsInvalidError,
  ServiceNameRequiredError,
  ServiceNotFoundError,
  ServicePriceInvalidError,
  TenantIdRequiredError,
} from './booking-domain.error';

describe('BookingDomainError (base class)', () => {
  it('sets name, code, field and is a real Error instance', () => {
    const err = new BookingDomainError(
      'something went wrong',
      BookingErrorCode.NOT_FOUND,
      'someField',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BookingDomainError);
    expect(err.name).toBe('BookingDomainError');
    expect(err.code).toBe(BookingErrorCode.NOT_FOUND);
    expect(err.field).toBe('someField');
    expect(err.message).toBe('something went wrong');
  });

  it('leaves field undefined when not provided', () => {
    const err = new BookingDomainError('x', BookingErrorCode.NOT_FOUND);
    expect(err.field).toBeUndefined();
  });
});

describe('booking domain error subclasses', () => {
  const cases: Array<{
    label: string;
    build: () => BookingDomainError;
    code: BookingErrorCode;
    field?: string;
  }> = [
    {
      label: 'ServiceNotFoundError',
      build: () => new ServiceNotFoundError('svc-1'),
      code: BookingErrorCode.SERVICE_NOT_FOUND,
    },
    {
      label: 'ServiceDeactivatedError',
      build: () => new ServiceDeactivatedError(),
      code: BookingErrorCode.SERVICE_DEACTIVATED,
    },
    {
      label: 'ClosureDateInPastError',
      build: () => new ClosureDateInPastError(),
      code: BookingErrorCode.CLOSURE_DATE_IN_PAST,
    },
    {
      label: 'ScheduleClosureNotFoundError',
      build: () => new ScheduleClosureNotFoundError('c-1'),
      code: BookingErrorCode.SCHEDULE_CLOSURE_NOT_FOUND,
    },
    {
      label: 'ScheduleAlreadyClosedError',
      build: () => new ScheduleAlreadyClosedError('2026-01-01'),
      code: BookingErrorCode.SCHEDULE_ALREADY_CLOSED,
    },
    {
      label: 'OpeningDateInPastError',
      build: () => new OpeningDateInPastError(),
      code: BookingErrorCode.OPENING_DATE_IN_PAST,
    },
    {
      label: 'DayAlreadyOpenInSettingsError',
      build: () => new DayAlreadyOpenInSettingsError('2026-01-01'),
      code: BookingErrorCode.DAY_ALREADY_OPEN_IN_SETTINGS,
    },
    {
      label: 'ScheduleOpeningAlreadyExistsError',
      build: () => new ScheduleOpeningAlreadyExistsError('2026-01-01'),
      code: BookingErrorCode.SCHEDULE_OPENING_ALREADY_EXISTS,
    },
    {
      label: 'ScheduleOpeningNotFoundError',
      build: () => new ScheduleOpeningNotFoundError('o-1'),
      code: BookingErrorCode.SCHEDULE_OPENING_NOT_FOUND,
    },
    {
      label: 'AvailabilityDateInPastError',
      build: () => new AvailabilityDateInPastError(),
      code: BookingErrorCode.AVAILABILITY_DATE_IN_PAST,
    },
    {
      label: 'AvailabilityRangeInvalidError',
      build: () => new AvailabilityRangeInvalidError('bad range'),
      code: BookingErrorCode.AVAILABILITY_RANGE_INVALID,
    },
    {
      label: 'BookingNotFoundError',
      build: () => new BookingNotFoundError('bk-1'),
      code: BookingErrorCode.NOT_FOUND,
    },
    {
      label: 'BookingLineRequiredError',
      build: () => new BookingLineRequiredError(),
      code: BookingErrorCode.LINE_REQUIRED,
    },
    {
      label: 'PickupAddressRequiredError',
      build: () => new PickupAddressRequiredError(),
      code: BookingErrorCode.PICKUP_ADDRESS_REQUIRED,
      field: 'pickupAddress',
    },
    {
      label: 'InvalidBookingTransitionError',
      build: () => new InvalidBookingTransitionError('A', 'B'),
      code: BookingErrorCode.INVALID_TRANSITION,
    },
    {
      label: 'BookingSlotUnavailableError',
      build: () => new BookingSlotUnavailableError(),
      code: BookingErrorCode.SLOT_UNAVAILABLE,
    },
    {
      label: 'BookingConcurrentModificationError',
      build: () => new BookingConcurrentModificationError(),
      code: BookingErrorCode.CONCURRENT_MODIFICATION,
    },
    {
      label: 'BookingServiceNotActiveError',
      build: () => new BookingServiceNotActiveError('svc-1'),
      code: BookingErrorCode.SERVICE_NOT_ACTIVE,
    },
    {
      label: 'BookingServiceNotInTenantError',
      build: () => new BookingServiceNotInTenantError('svc-1'),
      code: BookingErrorCode.SERVICE_NOT_IN_TENANT,
    },
    {
      label: 'CancellationWindowExpiredError',
      build: () => new CancellationWindowExpiredError(),
      code: BookingErrorCode.CANCELLATION_WINDOW_EXPIRED,
    },
    {
      label: 'BookingCustomerNotFoundError',
      build: () => new BookingCustomerNotFoundError('c-1'),
      code: BookingErrorCode.CUSTOMER_NOT_FOUND,
    },
    {
      label: 'CustomerPhoneNotSetError',
      build: () => new CustomerPhoneNotSetError(),
      code: BookingErrorCode.CUSTOMER_PHONE_NOT_SET,
    },
    {
      label: 'BookingRejectionReasonTooShortError',
      build: () => new BookingRejectionReasonTooShortError(),
      code: BookingErrorCode.REJECTION_REASON_TOO_SHORT,
      field: 'reason',
    },
    {
      label: 'BookingInfoMessageTooShortError',
      build: () => new BookingInfoMessageTooShortError(),
      code: BookingErrorCode.INFO_MESSAGE_TOO_SHORT,
      field: 'message',
    },
    {
      label: 'BookingForbiddenError',
      build: () => new BookingForbiddenError(),
      code: BookingErrorCode.FORBIDDEN,
    },
    {
      label: 'BookingScheduledInPastError',
      build: () => new BookingScheduledInPastError(),
      code: BookingErrorCode.SCHEDULED_IN_PAST,
    },
    {
      label: 'BookingScheduledAtInvalidError',
      build: () => new BookingScheduledAtInvalidError(),
      code: BookingErrorCode.SCHEDULED_AT_INVALID,
    },
    {
      label: 'CompleteBookingLinesIncompleteError',
      build: () => new CompleteBookingLinesIncompleteError(['l-1']),
      code: BookingErrorCode.COMPLETE_LINES_INCOMPLETE,
    },
    {
      label: 'BookingPhotoNotUploadedError',
      build: () => new BookingPhotoNotUploadedError('tenants/t1/x.jpg'),
      code: BookingErrorCode.PHOTO_NOT_UPLOADED,
    },
    {
      label: 'BookingDiscountNotAvailableError',
      build: () => new BookingDiscountNotAvailableError(),
      code: BookingErrorCode.DISCOUNT_NOT_AVAILABLE,
    },
    {
      label: 'BookingDiscountDisabledError',
      build: () => new BookingDiscountDisabledError(),
      code: BookingErrorCode.DISCOUNT_DISABLED,
    },
    {
      label: 'BookingDiscountMismatchError',
      build: () => new BookingDiscountMismatchError(),
      code: BookingErrorCode.DISCOUNT_MISMATCH,
    },
    {
      label: 'BookingDiscountExceedsTotalError',
      build: () => new BookingDiscountExceedsTotalError(),
      code: BookingErrorCode.DISCOUNT_EXCEEDS_TOTAL,
    },
    {
      label: 'InvalidTimeRangeError (format)',
      build: () =>
        new InvalidTimeRangeError('bad format', BookingErrorCode.TIME_RANGE_FORMAT_INVALID),
      code: BookingErrorCode.TIME_RANGE_FORMAT_INVALID,
    },
    {
      label: 'InvalidTimeRangeError (order)',
      build: () =>
        new InvalidTimeRangeError('bad order', BookingErrorCode.TIME_RANGE_ORDER_INVALID),
      code: BookingErrorCode.TIME_RANGE_ORDER_INVALID,
    },
    {
      label: 'TenantIdRequiredError',
      build: () => new TenantIdRequiredError(),
      code: BookingErrorCode.TENANT_ID_REQUIRED,
    },
    {
      label: 'CreatedByRequiredError',
      build: () => new CreatedByRequiredError(),
      code: BookingErrorCode.CREATED_BY_REQUIRED,
    },
    {
      label: 'ServiceNameRequiredError',
      build: () => new ServiceNameRequiredError(),
      code: BookingErrorCode.SERVICE_NAME_REQUIRED,
    },
    {
      label: 'ServicePriceInvalidError',
      build: () => new ServicePriceInvalidError(),
      code: BookingErrorCode.SERVICE_PRICE_INVALID,
    },
    {
      label: 'ServiceDurationInvalidError',
      build: () => new ServiceDurationInvalidError(),
      code: BookingErrorCode.SERVICE_DURATION_INVALID,
    },
    {
      label: 'ServiceLoyaltyPointsInvalidError',
      build: () => new ServiceLoyaltyPointsInvalidError(),
      code: BookingErrorCode.SERVICE_LOYALTY_POINTS_INVALID,
    },
    {
      label: 'ClosureReasonInvalidError',
      build: () => new ClosureReasonInvalidError('BAD_REASON'),
      code: BookingErrorCode.CLOSURE_REASON_INVALID,
    },
    {
      label: 'ClosureTimeRangeIncompleteError',
      build: () => new ClosureTimeRangeIncompleteError(),
      code: BookingErrorCode.CLOSURE_TIME_RANGE_INCOMPLETE,
    },
  ];

  it.each(cases)(
    '$label extends BookingDomainError and carries its code/field',
    ({ build, code, field }) => {
      const err = build();
      expect(err).toBeInstanceOf(BookingDomainError);
      expect(err.code).toBe(code);
      expect(err.field).toBe(field);
    },
  );
});

describe('BookingAddressValidationError', () => {
  it('does not extend BookingDomainError, but implements the same DomainErrorShape', () => {
    const err = new BookingAddressValidationError(
      'Invalid CEP: 123',
      AddressErrorCode.POSTAL_CODE_INVALID,
      'pickupAddress',
      { field: 'zipCode' },
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(BookingDomainError);
    expect(err.name).toBe('BookingAddressValidationError');
    expect(err.code).toBe(AddressErrorCode.POSTAL_CODE_INVALID);
    expect(err.field).toBe('pickupAddress');
    expect(err.params).toEqual({ field: 'zipCode' });
  });

  it('accepts a CountryCodeErrorCode as well as an AddressErrorCode', () => {
    const err = new BookingAddressValidationError(
      'countryCode must be supported',
      CountryCodeErrorCode.UNSUPPORTED,
      'contactAddress',
    );
    expect(err.code).toBe(CountryCodeErrorCode.UNSUPPORTED);
    expect(err.field).toBe('contactAddress');
    expect(err.params).toBeUndefined();
  });
});
