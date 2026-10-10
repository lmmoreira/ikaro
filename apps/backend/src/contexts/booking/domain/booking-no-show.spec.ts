import { BookingBuilder } from '../../../test/builders/booking/booking.builder';
import { BookingStatus } from './booking.aggregate';
import { StaffBookingActor } from './booking-status-transition';
import {
  BookingAlreadyTerminalError,
  BookingNotYetEndedError,
  InvalidBookingTransitionError,
} from './errors/booking-domain.error';
import { BookingCompleted } from './events/booking-completed.event';
import { BookingNoShow } from './events/booking-no-show.event';

const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const STAFF: StaffBookingActor = { type: 'STAFF', id: STAFF_ID };
const MANAGER: StaffBookingActor = { type: 'MANAGER', id: STAFF_ID };
const CORRELATION_ID = '00000000-0000-7000-8000-000000000003';

// Appointment 13:00–13:30 UTC.
const SCHEDULED_AT = new Date('2026-06-01T13:00:00.000Z');
const ENDS_AT = new Date('2026-06-01T13:30:00.000Z');
const AFTER_END = new Date('2026-06-01T14:00:00.000Z');

function approvedBooking(): BookingBuilder {
  return new BookingBuilder()
    .withStatus(BookingStatus.APPROVED)
    .withScheduledAt(SCHEDULED_AT)
    .withTotalDurationMins(30);
}

describe('Booking.markNoShow()', () => {
  it('transitions APPROVED → NO_SHOW after the end time and emits BookingNoShow only', () => {
    const booking = approvedBooking().build();

    booking.markNoShow(STAFF, CORRELATION_ID, undefined, AFTER_END);

    expect(booking.status).toBe(BookingStatus.NO_SHOW);
    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingNoShow);
    expect((events[0] as BookingNoShow).data).toEqual({
      bookingId: booking.id,
      actorId: STAFF_ID,
      reason: null,
      occurredAt: AFTER_END.toISOString(),
      customerId: booking.customerId,
      contactEmail: booking.contactEmail.address,
      contactName: booking.contactName,
      scheduledAt: SCHEDULED_AT.toISOString(),
      lineSummary: booking.lines.map((l) => ({
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toFixed(2),
          currency: l.priceAtBooking.currency,
        },
      })),
    });
  });

  it('carries the booking contact snapshot the customer email needs, for a guest booking too', () => {
    const booking = approvedBooking()
      .withCustomerId(null)
      .withContactEmail('guest@example.com')
      .withContactName('Visitante')
      .build();

    booking.markNoShow(STAFF, CORRELATION_ID, 'Nota interna', AFTER_END);

    const data = (booking.domainEvents[0] as BookingNoShow).data;
    expect(data.customerId).toBeNull();
    expect(data.contactEmail).toBe('guest@example.com');
    expect(data.contactName).toBe('Visitante');
    expect(data.lineSummary?.length).toBeGreaterThan(0);
    expect(data.reason).toBe('Nota interna');
  });

  it('carries a trimmed reason in the event and drops a blank one', () => {
    const withReason = approvedBooking().build();
    withReason.markNoShow(STAFF, CORRELATION_ID, '  Cliente não atendeu o telefone.  ', AFTER_END);
    expect((withReason.domainEvents[0] as BookingNoShow).data.reason).toBe(
      'Cliente não atendeu o telefone.',
    );

    const blank = approvedBooking().build();
    blank.markNoShow(STAFF, CORRELATION_ID, '   ', AFTER_END);
    expect((blank.domainEvents[0] as BookingNoShow).data.reason).toBeNull();
  });

  it('accepts the exact end instant (the appointment has just ended)', () => {
    const booking = approvedBooking().build();

    booking.markNoShow(STAFF, CORRELATION_ID, undefined, ENDS_AT);

    expect(booking.status).toBe(BookingStatus.NO_SHOW);
  });

  it('rejects before the scheduled end time and leaves the booking untouched', () => {
    const booking = approvedBooking().build();
    const beforeEnd = new Date(ENDS_AT.getTime() - 1);

    expect(() => booking.markNoShow(STAFF, CORRELATION_ID, undefined, beforeEnd)).toThrow(
      BookingNotYetEndedError,
    );
    expect(booking.status).toBe(BookingStatus.APPROVED);
    expect(booking.domainEvents).toHaveLength(0);
  });

  it.each([
    BookingStatus.COMPLETED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('rejects a %s booking as already terminal', (status) => {
    const booking = approvedBooking().withStatus(status).build();

    expect(() => booking.markNoShow(STAFF, CORRELATION_ID, undefined, AFTER_END)).toThrow(
      BookingAlreadyTerminalError,
    );
  });

  it.each([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED])(
    'rejects a %s booking as an invalid transition',
    (status) => {
      const booking = approvedBooking().withStatus(status).build();

      expect(() => booking.markNoShow(STAFF, CORRELATION_ID, undefined, AFTER_END)).toThrow(
        InvalidBookingTransitionError,
      );
    },
  );

  it('reports already-terminal before not-yet-ended', () => {
    const booking = approvedBooking().withStatus(BookingStatus.COMPLETED).build();
    const beforeEnd = new Date(SCHEDULED_AT.getTime());

    expect(() => booking.markNoShow(STAFF, CORRELATION_ID, undefined, beforeEnd)).toThrow(
      BookingAlreadyTerminalError,
    );
  });
});

describe('Booking.correctNoShow()', () => {
  it('completes a NO_SHOW booking at its booked prices and emits BookingCompleted only', () => {
    const booking = approvedBooking().withStatus(BookingStatus.NO_SHOW).build();

    booking.correctNoShow(MANAGER, CORRELATION_ID, 'Marked by mistake');

    expect(booking.status).toBe(BookingStatus.COMPLETED);
    expect(booking.completedBy).toBe(STAFF_ID);
    expect(booking.completedAt).toBeInstanceOf(Date);
    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingCompleted);
    const { lines, totalPrice, totalActualPrice, afterServicePhotoUrls, discountByPoints } = (
      events[0] as BookingCompleted
    ).data;
    expect(lines.length).toBeGreaterThan(0);
    lines.forEach((l) => expect(l.actualPriceCharged).toEqual(l.priceAtBooking));
    expect(totalActualPrice).toEqual(totalPrice);
    expect(afterServicePhotoUrls).toEqual([]);
    expect(discountByPoints).toBeUndefined();
  });

  it.each([
    BookingStatus.PENDING,
    BookingStatus.INFO_REQUESTED,
    BookingStatus.APPROVED,
    BookingStatus.COMPLETED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
  ])('rejects a %s booking', (status) => {
    const booking = approvedBooking().withStatus(status).build();

    expect(() => booking.correctNoShow(MANAGER, CORRELATION_ID, 'Marked by mistake')).toThrow(
      InvalidBookingTransitionError,
    );
  });
});
