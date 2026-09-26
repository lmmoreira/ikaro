import { Money } from '../../../shared/value-objects/money';
import { BookingQuoteRevision } from './booking-quote-revision';

const TENANT_ID = '10000000-0000-4000-8000-000000000801';
const BOOKING_ID = '20000000-0000-4000-8000-000000000801';

describe('BookingQuoteRevision.record()', () => {
  it('starts at revision_no 1 when previousRevisionNo is 0', () => {
    const revision = BookingQuoteRevision.record({
      tenantId: TENANT_ID,
      bookingId: BOOKING_ID,
      previousRevisionNo: 0,
      amount: Money.from(150, 'BRL'),
      reason: 'RESCHEDULE_DURATION_CHANGE',
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    expect(revision.revisionNo).toBe(1);
    expect(revision.tenantId).toBe(TENANT_ID);
    expect(revision.bookingId).toBe(BOOKING_ID);
    expect(revision.amount.equals(Money.from(150, 'BRL'))).toBe(true);
    expect(revision.actorType).toBe('CUSTOMER');
    expect(revision.actorId).toBe('customer-1');
    expect(revision.id).toBeDefined();
    expect(revision.occurredAt).toBeInstanceOf(Date);
  });

  it('increments from an existing previousRevisionNo', () => {
    const revision = BookingQuoteRevision.record({
      tenantId: TENANT_ID,
      bookingId: BOOKING_ID,
      previousRevisionNo: 3,
      amount: Money.from(200, 'BRL'),
      reason: 'RESCHEDULE_DURATION_CHANGE',
      actorType: 'STAFF',
      actorId: 'staff-1',
    });

    expect(revision.revisionNo).toBe(4);
  });
});

describe('BookingQuoteRevision.reconstitute()', () => {
  it('rebuilds an equivalent instance from persisted props', () => {
    const occurredAt = new Date('2026-01-01T00:00:00Z');
    const revision = BookingQuoteRevision.reconstitute({
      id: 'revision-1',
      tenantId: TENANT_ID,
      bookingId: BOOKING_ID,
      revisionNo: 2,
      amount: Money.from(100, 'BRL'),
      reason: 'RESCHEDULE_DURATION_CHANGE',
      actorType: 'CUSTOMER',
      actorId: null,
      occurredAt,
    });

    expect(revision.revisionNo).toBe(2);
    expect(revision.actorId).toBeNull();
    expect(revision.occurredAt).toBe(occurredAt);
  });
});
