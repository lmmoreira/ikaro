import { Money } from '../../../shared/value-objects/money';
import { testAddress } from '../../../test/utils/address-helpers';
import { BookingBuilder } from '../../../test/builders/booking/booking.builder';
import { BookingLineBuilder } from '../../../test/builders/booking/booking-line.builder';
import { BookingLineInputBuilder } from '../../../test/builders/booking/booking-line-input.builder';
import { Booking, BookingStatus, RequestBookingInput } from './booking.aggregate';
import {
  BookingInfoMessageTooShortError,
  BookingLineRequiredError,
  BookingRejectionReasonTooShortError,
  InvalidBookingTransitionError,
  PickupAddressRequiredError,
} from './errors/booking-domain.error';
import { BookingRequested } from './events/booking-requested.event';
import { BookingApproved } from './events/booking-approved.event';
import { BookingRejected } from './events/booking-rejected.event';
import { BookingInfoRequested } from './events/booking-info-requested.event';
import { BookingInfoSubmitted } from './events/booking-info-submitted.event';
import { BookingCompleted } from './events/booking-completed.event';
import { BookingCancelled } from './events/booking-cancelled.event';
import { BookingRescheduled } from './events/booking-rescheduled.event';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000003';

const pickupAddr = testAddress();

function lineInput(): BookingLineInputBuilder {
  return new BookingLineInputBuilder();
}

function request(overrides: Partial<RequestBookingInput> = {}): Booking {
  return Booking.requestBooking({
    tenantId: TENANT_ID,
    contactEmail: 'g@t.com',
    contactName: 'Test Guest',
    contactPhone: '+5531999999999',
    scheduledAt: new Date(Date.now() + 3_600_000),
    lineInputs: [lineInput().build()],
    type: 'GUEST',
    correlationId: CORRELATION_ID,
    ...overrides,
  });
}

describe('Booking.requestBooking()', () => {
  it('creates a PENDING booking with correct totals from lines', () => {
    const line1 = lineInput()
      .withPriceAtBooking(Money.from(80, 'BRL'))
      .withDurationMinsAtBooking(20)
      .build();
    const line2 = lineInput()
      .withPriceAtBooking(Money.from(50, 'BRL'))
      .withDurationMinsAtBooking(15)
      .build();

    const booking = request({
      contactEmail: 'guest@test.com',
      contactName: 'João',
      lineInputs: [line1, line2],
    });

    expect(booking.status).toBe(BookingStatus.PENDING);
    expect(booking.type).toBe('GUEST');
    expect(booking.customerId).toBeNull();
    expect(booking.totalDurationMins).toBe(35);
    expect(booking.totalPrice.amount.toFixed(2)).toBe('130.00');
    expect(booking.lines).toHaveLength(2);
    expect(booking.totalActualPrice).toBeNull();
  });

  it('stores contactAddress and pickupAddress independently', () => {
    const guestAddr = testAddress({
      street: 'Av. Brasil',
      number: '200',
      city: 'BH',
      zipCode: '31000000',
    });

    const booking = request({
      contactEmail: 'g@test.com',
      contactName: 'Maria',
      contactAddress: guestAddr,
    });

    expect(booking.contactAddress?.city).toBe('BH');
    expect(booking.pickupAddress).toBeNull();
  });

  it('throws BookingLineRequiredError when lines array is empty', () => {
    expect(() => request({ lineInputs: [] })).toThrow(BookingLineRequiredError);
  });

  it('throws PickupAddressRequiredError when a pickup line has no pickupAddress', () => {
    const pickupLine = lineInput().withRequiresPickupAddressAtBooking(true).build();
    expect(() => request({ lineInputs: [pickupLine] })).toThrow(PickupAddressRequiredError);
  });

  it('accepts a pickup line when pickupAddress is provided', () => {
    const pickupLine = lineInput().withRequiresPickupAddressAtBooking(true).build();
    const booking = request({ lineInputs: [pickupLine], pickupAddress: pickupAddr });
    expect(booking.pickupAddress?.street).toBe('Rua das Flores');
  });

  it('emits BookingRequested domain event', () => {
    const booking = request({ contactEmail: 'g@test.com', contactName: 'João' });
    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingRequested);
    expect((events[0] as BookingRequested).data.bookingId).toBe(booking.id);
    expect((events[0] as BookingRequested).data.requiresPickup).toBe(false);
  });

  it('sets type=CUSTOMER and customerId when authenticated', () => {
    const customerId = '00000000-0000-7000-8000-000000000099';
    const booking = request({
      contactEmail: 'c@test.com',
      contactName: 'Ana',
      contactPhone: '+5531888888888',
      type: 'CUSTOMER',
      customerId,
    });
    expect(booking.type).toBe('CUSTOMER');
    expect(booking.customerId).toBe(customerId);
  });
});

describe('Booking.approve()', () => {
  it('transitions PENDING → APPROVED and emits BookingApproved', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    booking.approve(STAFF_ID, CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.APPROVED);
    expect(booking.approvedBy).toBe(STAFF_ID);
    expect(booking.approvedAt).toBeInstanceOf(Date);
    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingApproved);
  });

  it('transitions INFO_REQUESTED → APPROVED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    booking.approve(STAFF_ID, CORRELATION_ID);
    expect(booking.status).toBe(BookingStatus.APPROVED);
  });

  it('throws when already APPROVED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.APPROVED).build();
    expect(() => booking.approve(STAFF_ID, CORRELATION_ID)).toThrow(InvalidBookingTransitionError);
  });

  it('throws when COMPLETED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.COMPLETED).build();
    expect(() => booking.approve(STAFF_ID, CORRELATION_ID)).toThrow(InvalidBookingTransitionError);
  });

  it('throws when CANCELLED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.CANCELLED).build();
    expect(() => booking.approve(STAFF_ID, CORRELATION_ID)).toThrow(InvalidBookingTransitionError);
  });

  it('throws when REJECTED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.REJECTED).build();
    expect(() => booking.approve(STAFF_ID, CORRELATION_ID)).toThrow(InvalidBookingTransitionError);
  });
});

describe('Booking.reject()', () => {
  const VALID_REASON = 'Service unavailable for the requested date';

  it('transitions PENDING → REJECTED and emits BookingRejected', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    booking.reject(STAFF_ID, VALID_REASON, CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.REJECTED);
    expect(booking.rejectionReason).toBe(VALID_REASON);
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingRejected);
  });

  it('transitions INFO_REQUESTED → REJECTED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    booking.reject(STAFF_ID, VALID_REASON, CORRELATION_ID);
    expect(booking.status).toBe(BookingStatus.REJECTED);
  });

  it('throws BookingRejectionReasonTooShortError when reason is too short', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    expect(() => booking.reject(STAFF_ID, 'short', CORRELATION_ID)).toThrow(
      BookingRejectionReasonTooShortError,
    );
  });

  it('throws when COMPLETED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.COMPLETED).build();
    expect(() => booking.reject(STAFF_ID, VALID_REASON, CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });
});

describe('Booking.requestMoreInfo()', () => {
  it('transitions PENDING → INFO_REQUESTED and emits BookingInfoRequested', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    const before = new Date();
    booking.requestMoreInfo(STAFF_ID, 'Please send car photos', CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.INFO_REQUESTED);
    expect(booking.infoRequestMessage).toBe('Please send car photos');
    expect(booking.infoRequestedBy).toBe(STAFF_ID);
    expect(booking.infoRequestedAt).toBeInstanceOf(Date);
    expect(booking.infoRequestedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingInfoRequested);
  });

  it('throws BookingInfoMessageTooShortError when message is shorter than 20 chars', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    expect(() => booking.requestMoreInfo(STAFF_ID, 'Too short', CORRELATION_ID)).toThrow(
      BookingInfoMessageTooShortError,
    );
  });

  it('throws InvalidBookingTransitionError when already INFO_REQUESTED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    expect(() =>
      booking.requestMoreInfo(
        STAFF_ID,
        'Please provide more details about the vehicle',
        CORRELATION_ID,
      ),
    ).toThrow(InvalidBookingTransitionError);
  });
});

describe('Booking.submitInformation()', () => {
  it('transitions INFO_REQUESTED → PENDING and emits BookingInfoSubmitted', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    const before = new Date();
    booking.submitInformation('guest@test.com', { notes: 'Here are the photos' }, CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.PENDING);
    expect(booking.infoResponseMessage).toBe('Here are the photos');
    expect(booking.infoSubmittedAt).toBeInstanceOf(Date);
    expect(booking.infoSubmittedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingInfoSubmitted);
    expect((events[0] as BookingInfoSubmitted).data.photoUrls).toEqual([]);
  });

  it('appends photos to beforeServicePhotoUrls when provided', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    booking.submitInformation('g@t.com', {}, CORRELATION_ID, ['extra1.jpg', 'extra2.jpg']);

    expect(booking.beforeServicePhotoUrls).toEqual(['extra1.jpg', 'extra2.jpg']);
    const event = booking.domainEvents[0] as BookingInfoSubmitted;
    expect(event.data.photoUrls).toEqual(['extra1.jpg', 'extra2.jpg']);
  });

  it('does not modify beforeServicePhotoUrls when no photos provided', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    booking.submitInformation('g@t.com', {}, CORRELATION_ID);
    expect(booking.beforeServicePhotoUrls).toEqual([]);
  });

  it('throws when not INFO_REQUESTED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    expect(() => booking.submitInformation('g@t.com', {}, CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });
});

describe('Booking.complete()', () => {
  it('transitions APPROVED → COMPLETED, sets actual prices, and emits BookingCompleted', () => {
    const line = new BookingLineBuilder().withPriceAtBooking(Money.from(100, 'BRL')).build();
    const booking = new BookingBuilder()
      .withStatus(BookingStatus.APPROVED)
      .withLines([line])
      .withTotalPrice(Money.from(100, 'BRL'))
      .withTotalDurationMins(30)
      .build();

    const actualPrices = new Map([[line.lineId, Money.from(90, 'BRL')]]);
    booking.complete(STAFF_ID, actualPrices, ['photo.jpg'], CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.COMPLETED);
    expect(booking.completedBy).toBe(STAFF_ID);
    expect(booking.totalActualPrice?.amount.toFixed(2)).toBe('90.00');
    expect(booking.afterServicePhotoUrls).toContain('photo.jpg');
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingCompleted);
    expect((events[0] as BookingCompleted).data.totalActualPrice.amount).toBe('90.00');
  });

  it('defaults to priceAtBooking when line not in actualPrices map', () => {
    const line = new BookingLineBuilder().withPriceAtBooking(Money.from(150, 'BRL')).build();
    const booking = new BookingBuilder()
      .withStatus(BookingStatus.APPROVED)
      .withLines([line])
      .withTotalPrice(Money.from(150, 'BRL'))
      .build();

    booking.complete(STAFF_ID, new Map(), [], CORRELATION_ID);

    expect(booking.totalActualPrice?.amount.toFixed(2)).toBe('150.00');
  });

  it('throws when not APPROVED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    expect(() => booking.complete(STAFF_ID, new Map(), [], CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });
});

describe('Booking.cancel()', () => {
  it('cancels a PENDING booking and emits BookingCancelled', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    booking.cancel(STAFF_ID, true, CORRELATION_ID, 'Admin cancelled');

    expect(booking.status).toBe(BookingStatus.CANCELLED);
    expect(booking.cancellationReason).toBe('Admin cancelled');
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingCancelled);
  });

  it('cancels INFO_REQUESTED booking', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.INFO_REQUESTED).build();
    booking.cancel(STAFF_ID, true, CORRELATION_ID);
    expect(booking.status).toBe(BookingStatus.CANCELLED);
  });

  it('cancels APPROVED booking', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.APPROVED).build();
    booking.cancel(STAFF_ID, true, CORRELATION_ID);
    expect(booking.status).toBe(BookingStatus.CANCELLED);
  });

  it('throws when COMPLETED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.COMPLETED).build();
    expect(() => booking.cancel(STAFF_ID, false, CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws when already CANCELLED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.CANCELLED).build();
    expect(() => booking.cancel(STAFF_ID, false, CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws when REJECTED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.REJECTED).build();
    expect(() => booking.cancel(STAFF_ID, false, CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });
});

describe('Booking.reschedule()', () => {
  it('updates scheduledAt and emits BookingRescheduled, status stays APPROVED', () => {
    const originalDate = new Date(Date.now() + 24 * 3_600_000);
    const newDate = new Date(Date.now() + 48 * 3_600_000);
    const booking = new BookingBuilder()
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(originalDate)
      .build();

    booking.reschedule(STAFF_ID, newDate, CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.APPROVED);
    expect(booking.scheduledAt).toBe(newDate);
    const events = booking.domainEvents;
    expect(events[0]).toBeInstanceOf(BookingRescheduled);
    expect((events[0] as BookingRescheduled).data.rescheduledBy).toBe(STAFF_ID);
  });

  it('throws when not APPROVED', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();
    expect(() => booking.reschedule(STAFF_ID, new Date(), CORRELATION_ID)).toThrow(
      InvalidBookingTransitionError,
    );
  });
});

describe('Booking.isEligibleForCancellation()', () => {
  it('returns true when appointment is outside the window', () => {
    const booking = new BookingBuilder()
      .withScheduledAt(new Date(Date.now() + 72 * 3_600_000))
      .build();
    expect(booking.isEligibleForCancellation(48)).toBe(true);
  });

  it('returns false when appointment is inside the window', () => {
    const booking = new BookingBuilder()
      .withScheduledAt(new Date(Date.now() + 24 * 3_600_000))
      .build();
    expect(booking.isEligibleForCancellation(48)).toBe(false);
  });
});

describe('Booking — totalPrice and totalDurationMins derived correctly', () => {
  it('derives totals from line sum', () => {
    const lines = [
      lineInput().withPriceAtBooking(Money.from(80, 'BRL')).withDurationMinsAtBooking(20).build(),
      lineInput().withPriceAtBooking(Money.from(120, 'BRL')).withDurationMinsAtBooking(45).build(),
      lineInput().withPriceAtBooking(Money.from(50, 'BRL')).withDurationMinsAtBooking(15).build(),
    ];
    const booking = request({ lineInputs: lines });
    expect(booking.totalDurationMins).toBe(80);
    expect(booking.totalPrice.amount.toFixed(2)).toBe('250.00');
  });
});

describe('Booking domain events — event envelope fields', () => {
  it('BookingRequested carries correct tenantId and correlationId', () => {
    const booking = request();
    const event = booking.domainEvents[0] as BookingRequested;
    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.correlationId).toBe(CORRELATION_ID);
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event.occurredAt).toBeTruthy();
    expect(event.eventName).toBe('BookingRequested');
    expect(event.eventVersion).toBe(1);
  });
});
