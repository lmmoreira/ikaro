import { BookingBuilder } from '../../../test/builders/booking/booking.builder';
import { APPROVAL_EXPIRED_REASON, BookingStatus } from './booking.aggregate';
import { InvalidBookingTransitionError } from './errors/booking-domain.error';
import { BookingCancelled } from './events/booking-cancelled.event';

const CORRELATION_ID = '00000000-0000-7000-8000-000000000003';

describe('Booking.expireApproval()', () => {
  it('cancels a PENDING booking as the system, with no actor and the expiry reason', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();

    booking.expireApproval(CORRELATION_ID);

    expect(booking.status).toBe(BookingStatus.CANCELLED);
    expect(booking.cancelledBy).toBeNull();
    expect(booking.cancelledAt).toBeInstanceOf(Date);
    expect(booking.cancellationReason).toBe(APPROVAL_EXPIRED_REASON);
  });

  it('records the status change as a SYSTEM audit row with no actor id', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();

    booking.expireApproval(CORRELATION_ID);

    expect(booking.drainStatusTransitions()).toMatchObject([
      {
        bookingId: booking.id,
        fromStatus: 'PENDING',
        toStatus: 'CANCELLED',
        actorType: 'SYSTEM',
        actorId: null,
        reason: APPROVAL_EXPIRED_REASON,
      },
    ]);
  });

  it('emits BookingCancelled flagged as a hold expiry, with a null cancelledBy', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();

    booking.expireApproval(CORRELATION_ID);

    const events = booking.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(BookingCancelled);
    expect((events[0] as BookingCancelled).data).toMatchObject({
      bookingId: booking.id,
      cancelledBy: null,
      cancelledByHoldExpiry: true,
      cancelledByScheduleEnd: false,
      reason: APPROVAL_EXPIRED_REASON,
    });
  });

  it.each([
    BookingStatus.INFO_REQUESTED,
    BookingStatus.APPROVED,
    BookingStatus.REJECTED,
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
  ])('refuses to expire a %s booking', (status) => {
    const booking = new BookingBuilder().withStatus(status).build();

    expect(() => booking.expireApproval(CORRELATION_ID)).toThrow(InvalidBookingTransitionError);
    expect(booking.status).toBe(status);
    expect(booking.domainEvents).toHaveLength(0);
  });

  it('leaves cancelledByHoldExpiry false on an ordinary cancellation', () => {
    const booking = new BookingBuilder().withStatus(BookingStatus.PENDING).build();

    booking.cancel({ type: 'STAFF', id: '00000000-0000-7000-8000-000000000002' }, CORRELATION_ID);

    expect((booking.domainEvents[0] as BookingCancelled).data.cancelledByHoldExpiry).toBe(false);
  });
});
