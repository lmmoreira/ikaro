import { BookingBuilder } from '../../../test/builders/booking/booking.builder';
import { BookingStatus } from './booking.aggregate';
import { BookingResourceReassigned } from './events/booking-resource-reassigned.event';

const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000003';
const SCHEDULED_AT = new Date('2026-06-01T13:00:00.000Z');

function approvedBooking(): BookingBuilder {
  return new BookingBuilder()
    .withStatus(BookingStatus.APPROVED)
    .withScheduledAt(SCHEDULED_AT)
    .withTotalDurationMins(30);
}

describe('Booking.recordResourceReassigned()', () => {
  it('adds a BookingResourceReassigned carrying the unchanged slot and the contact snapshot', () => {
    const booking = approvedBooking().build();

    booking.recordResourceReassigned(STAFF_ID, CORRELATION_ID, 'Sala 2');

    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingResourceReassigned);
    expect((events[0] as BookingResourceReassigned).data).toEqual({
      bookingId: booking.id,
      customerId: booking.customerId,
      contactEmail: booking.contactEmail.address,
      contactName: booking.contactName,
      slot: { startTime: SCHEDULED_AT.toISOString(), endTime: '2026-06-01T13:30:00.000Z' },
      lineSummary: booking.lines.map((l) => ({
        serviceId: l.serviceId,
        serviceNameAtBooking: l.serviceNameAtBooking,
        priceAtBooking: {
          amount: l.priceAtBooking.amount.toFixed(2),
          currency: l.priceAtBooking.currency,
        },
      })),
      reassignedBy: STAFF_ID,
      newResourceName: 'Sala 2',
    });
  });

  it('carries a null resource name when the requirement does not disclose it', () => {
    const booking = approvedBooking().build();

    booking.recordResourceReassigned(STAFF_ID, CORRELATION_ID, null);

    expect((booking.domainEvents[0] as BookingResourceReassigned).data.newResourceName).toBeNull();
  });

  it('changes nothing else on the booking: time and status stay, no BookingRescheduled', () => {
    const booking = approvedBooking().build();

    booking.recordResourceReassigned(STAFF_ID, CORRELATION_ID, 'Sala 2');

    expect(booking.status).toBe(BookingStatus.APPROVED);
    expect(booking.scheduledAt).toEqual(SCHEDULED_AT);
    expect(booking.domainEvents.map((e) => e.eventName)).toEqual(['BookingResourceReassigned']);
  });
});
