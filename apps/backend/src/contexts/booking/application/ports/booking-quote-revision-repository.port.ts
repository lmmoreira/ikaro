import { BookingQuoteRevision } from '../../domain/booking-quote-revision';

export const BOOKING_QUOTE_REVISION_REPOSITORY = Symbol('IBookingQuoteRevisionRepository');

export interface IBookingQuoteRevisionRepository {
  // 0 when the booking has no prior revision yet — BookingQuoteRevision.record() then starts at
  // revision_no 1. Must be called from inside the same transaction as the eventual save() below,
  // same "re-check the cross-row invariant inside the write transaction" discipline every
  // sequence-number allocation in this codebase follows.
  findLatestRevisionNo(tenantId: string, bookingId: string): Promise<number>;
  // Named save() (not e.g. record()/insert()) so architecture-check's transactional-save detector
  // enforces this call stays textually inside txManager.run() (docs/ENGINEERING_RULES_BACKEND.md).
  save(revision: BookingQuoteRevision): Promise<void>;
}
