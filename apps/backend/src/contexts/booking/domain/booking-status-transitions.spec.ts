import { Money } from '../../../shared/value-objects/money';
import { BookingBuilder } from '../../../test/builders/booking/booking.builder';
import { Booking, BookingStatus } from './booking.aggregate';
import { IdentifiedBookingActor, StaffBookingActor } from './booking-status-transition';
import {
  BookingNotYetEndedError,
  BookingRejectionReasonTooShortError,
  InvalidBookingTransitionError,
} from './errors/booking-domain.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF: StaffBookingActor = { type: 'STAFF', id: '00000000-0000-7000-8000-000000000002' };
const MANAGER: StaffBookingActor = { type: 'MANAGER', id: '00000000-0000-7000-8000-000000000003' };
const CUSTOMER: IdentifiedBookingActor = {
  type: 'CUSTOMER',
  id: '00000000-0000-7000-8000-000000000004',
};
const CORRELATION_ID = '00000000-0000-7000-8000-000000000005';
const LONG_ENOUGH_MESSAGE = 'Please send a photo of the car';
const LONG_ENOUGH_REASON = 'Service unavailable that day';

const build = (status: BookingStatus): Booking =>
  new BookingBuilder().withTenantId(TENANT_ID).withStatus(status).build();

describe('Booking — status transition recording', () => {
  it('records approve as one PENDING → APPROVED transition for the actor', () => {
    const booking = build(BookingStatus.PENDING);

    booking.approve(MANAGER, CORRELATION_ID);

    const [transition, ...rest] = booking.drainStatusTransitions();
    expect(rest).toEqual([]);
    expect(transition).toMatchObject({
      tenantId: TENANT_ID,
      bookingId: booking.id,
      fromStatus: 'PENDING',
      toStatus: 'APPROVED',
      actorType: 'MANAGER',
      actorId: MANAGER.id,
      reason: null,
      correlationId: CORRELATION_ID,
    });
  });

  it('records approve from INFO_REQUESTED with that from-status', () => {
    const booking = build(BookingStatus.INFO_REQUESTED);

    booking.approve(STAFF, CORRELATION_ID);

    expect(booking.drainStatusTransitions()).toMatchObject([
      { fromStatus: 'INFO_REQUESTED', toStatus: 'APPROVED', actorType: 'STAFF' },
    ]);
  });

  it.each([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED])(
    'records reject from %s with the trimmed reason',
    (from) => {
      const booking = build(from);

      booking.reject(STAFF, `  ${LONG_ENOUGH_REASON}  `, CORRELATION_ID);

      expect(booking.drainStatusTransitions()).toMatchObject([
        { fromStatus: from, toStatus: 'REJECTED', actorId: STAFF.id, reason: LONG_ENOUGH_REASON },
      ]);
    },
  );

  it('records requestMoreInfo with the staff message as the reason', () => {
    const booking = build(BookingStatus.PENDING);

    booking.requestMoreInfo(STAFF, LONG_ENOUGH_MESSAGE, CORRELATION_ID);

    expect(booking.drainStatusTransitions()).toMatchObject([
      {
        fromStatus: 'PENDING',
        toStatus: 'INFO_REQUESTED',
        actorType: 'STAFF',
        reason: LONG_ENOUGH_MESSAGE,
      },
    ]);
  });

  it('records a customer reply as INFO_REQUESTED → PENDING with the customer as actor', () => {
    const booking = build(BookingStatus.INFO_REQUESTED);

    booking.submitInformation('c@test.com', { notes: 'free text' }, CORRELATION_ID, CUSTOMER);

    expect(booking.drainStatusTransitions()).toMatchObject([
      {
        fromStatus: 'INFO_REQUESTED',
        toStatus: 'PENDING',
        actorType: 'CUSTOMER',
        actorId: CUSTOMER.id,
        reason: null,
      },
    ]);
  });

  it('records a guest reply with no actor id', () => {
    const booking = build(BookingStatus.INFO_REQUESTED);

    booking.submitInformation('g@test.com', {}, CORRELATION_ID, { type: 'GUEST', id: null });

    expect(booking.drainStatusTransitions()).toMatchObject([
      { fromStatus: 'INFO_REQUESTED', toStatus: 'PENDING', actorType: 'GUEST', actorId: null },
    ]);
  });

  it('puts the customer id, not a guest, into the BookingInfoSubmitted event', () => {
    const customerReply = build(BookingStatus.INFO_REQUESTED);
    const guestReply = build(BookingStatus.INFO_REQUESTED);

    customerReply.submitInformation('c@test.com', {}, CORRELATION_ID, CUSTOMER);
    guestReply.submitInformation('g@test.com', {}, CORRELATION_ID, { type: 'GUEST', id: null });

    expect(customerReply.domainEvents[0]).toMatchObject({ data: { customerId: CUSTOMER.id } });
    expect(guestReply.domainEvents[0]).toMatchObject({ data: { customerId: null } });
  });

  it('records complete as APPROVED → COMPLETED with no reason', () => {
    const booking = build(BookingStatus.APPROVED);

    booking.complete(
      STAFF,
      new Map([[booking.lines[0].lineId, Money.from(50, 'BRL')]]),
      [],
      CORRELATION_ID,
    );

    expect(booking.drainStatusTransitions()).toMatchObject([
      { fromStatus: 'APPROVED', toStatus: 'COMPLETED', actorType: 'STAFF', reason: null },
    ]);
  });

  it.each([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED, BookingStatus.APPROVED])(
    'records cancel from %s, and derives isBusiness from the actor',
    (from) => {
      const byStaff = build(from);
      const byCustomer = build(from);

      byStaff.cancel(MANAGER, CORRELATION_ID, 'Admin cancelled');
      byCustomer.cancel(CUSTOMER, CORRELATION_ID);

      expect(byStaff.drainStatusTransitions()).toMatchObject([
        {
          fromStatus: from,
          toStatus: 'CANCELLED',
          actorType: 'MANAGER',
          actorId: MANAGER.id,
          reason: 'Admin cancelled',
        },
      ]);
      expect(byCustomer.drainStatusTransitions()).toMatchObject([
        { fromStatus: from, toStatus: 'CANCELLED', actorType: 'CUSTOMER', reason: null },
      ]);
      expect(byStaff.domainEvents[0]).toMatchObject({
        data: { cancelledBy: MANAGER.id, isBusiness: true },
      });
      expect(byCustomer.domainEvents[0]).toMatchObject({
        data: { cancelledBy: CUSTOMER.id, isBusiness: false },
      });
    },
  );

  it('records markNoShow with the normalized reason, then the correction as NO_SHOW → COMPLETED', () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_ID)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(new Date('2026-06-01T13:00:00.000Z'))
      .withTotalDurationMins(30)
      .build();

    booking.markNoShow(
      STAFF,
      CORRELATION_ID,
      '  Did not show  ',
      new Date('2026-06-01T15:00:00.000Z'),
    );
    booking.correctNoShow(MANAGER, CORRELATION_ID, 'Arrived late and was served');

    expect(booking.drainStatusTransitions()).toMatchObject([
      { fromStatus: 'APPROVED', toStatus: 'NO_SHOW', actorType: 'STAFF', reason: 'Did not show' },
      {
        fromStatus: 'NO_SHOW',
        toStatus: 'COMPLETED',
        actorType: 'MANAGER',
        reason: 'Arrived late and was served',
      },
    ]);
  });

  it('records the transitions of one booking in the order they happened', () => {
    const booking = build(BookingStatus.PENDING);

    booking.requestMoreInfo(STAFF, LONG_ENOUGH_MESSAGE, CORRELATION_ID);
    booking.submitInformation('c@test.com', {}, CORRELATION_ID, CUSTOMER);
    booking.approve(STAFF, CORRELATION_ID);

    expect(booking.drainStatusTransitions().map((t) => [t.fromStatus, t.toStatus])).toEqual([
      ['PENDING', 'INFO_REQUESTED'],
      ['INFO_REQUESTED', 'PENDING'],
      ['PENDING', 'APPROVED'],
    ]);
  });

  it('hands every pending transition over once, then has none', () => {
    const booking = build(BookingStatus.PENDING);
    booking.approve(STAFF, CORRELATION_ID);

    expect(booking.drainStatusTransitions()).toHaveLength(1);
    expect(booking.drainStatusTransitions()).toEqual([]);
  });

  describe('a rejected transition records nothing', () => {
    it.each([
      [
        'approve a COMPLETED booking',
        BookingStatus.COMPLETED,
        (b: Booking) => b.approve(STAFF, CORRELATION_ID),
        InvalidBookingTransitionError,
      ],
      [
        'reject with a too-short reason',
        BookingStatus.PENDING,
        (b: Booking) => b.reject(STAFF, 'short', CORRELATION_ID),
        BookingRejectionReasonTooShortError,
      ],
      [
        'reject an APPROVED booking',
        BookingStatus.APPROVED,
        (b: Booking) => b.reject(STAFF, LONG_ENOUGH_REASON, CORRELATION_ID),
        InvalidBookingTransitionError,
      ],
      [
        'request info on an APPROVED booking',
        BookingStatus.APPROVED,
        (b: Booking) => b.requestMoreInfo(STAFF, LONG_ENOUGH_MESSAGE, CORRELATION_ID),
        InvalidBookingTransitionError,
      ],
      [
        'reply to a PENDING booking',
        BookingStatus.PENDING,
        (b: Booking) => b.submitInformation('c@test.com', {}, CORRELATION_ID, CUSTOMER),
        InvalidBookingTransitionError,
      ],
      [
        'complete a PENDING booking',
        BookingStatus.PENDING,
        (b: Booking) => b.complete(STAFF, new Map(), [], CORRELATION_ID),
        InvalidBookingTransitionError,
      ],
      [
        'cancel a COMPLETED booking',
        BookingStatus.COMPLETED,
        (b: Booking) => b.cancel(STAFF, CORRELATION_ID),
        InvalidBookingTransitionError,
      ],
      [
        'correct a booking that is not a no-show',
        BookingStatus.APPROVED,
        (b: Booking) => b.correctNoShow(MANAGER, CORRELATION_ID, 'Marked by mistake'),
        InvalidBookingTransitionError,
      ],
      [
        'mark a no-show before the appointment ended',
        BookingStatus.APPROVED,
        (b: Booking) => b.markNoShow(STAFF, CORRELATION_ID, undefined, new Date(0)),
        BookingNotYetEndedError,
      ],
    ])('%s', (_name, status, act, error) => {
      const booking = build(status);

      expect(() => act(booking)).toThrow(error);

      expect(booking.drainStatusTransitions()).toEqual([]);
    });
  });
});
