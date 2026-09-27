import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Money } from '../../../shared/value-objects/money';

export type BookingQuoteRevisionActorType = 'CUSTOMER' | 'STAFF';

export interface BookingQuoteRevisionProps {
  id: string;
  tenantId: string;
  bookingId: string;
  revisionNo: number;
  amount: Money;
  reason: string;
  actorType: BookingQuoteRevisionActorType;
  actorId: string | null;
  occurredAt: Date;
}

export interface RecordBookingQuoteRevisionInput {
  tenantId: string;
  bookingId: string;
  // Resolved by the caller (IBookingQuoteRevisionRepository.findLatestRevisionNo) — 0 when this
  // booking has no prior revision.
  previousRevisionNo: number;
  amount: Money;
  reason: string;
  actorType: BookingQuoteRevisionActorType;
  actorId: string | null;
}

// M23 Cluster 3 (UC-069) — an independent, append-only aggregate root, own repository, "new
// revision supersedes nothing, previous rows are never edited" — same pattern as
// ServiceBookingIntakeSchema (docs/ENGINEERING_RULES_BACKEND.md § A versioned, append-only child
// concept), not a Booking-owned child collection. Source-exclusive with the (not-yet-reachable)
// class_session_booking_id column — see docs/13-DATABASE_SCHEMA.md § booking_quote_revisions.
export class BookingQuoteRevision extends AggregateRoot {
  private readonly props: BookingQuoteRevisionProps;

  private constructor(props: BookingQuoteRevisionProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get bookingId(): string {
    return this.props.bookingId;
  }
  get revisionNo(): number {
    return this.props.revisionNo;
  }
  get amount(): Money {
    return this.props.amount;
  }
  get reason(): string {
    return this.props.reason;
  }
  get actorType(): BookingQuoteRevisionActorType {
    return this.props.actorType;
  }
  get actorId(): string | null {
    return this.props.actorId;
  }
  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  static record(input: RecordBookingQuoteRevisionInput): BookingQuoteRevision {
    return new BookingQuoteRevision({
      id: uuidv7(),
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      revisionNo: input.previousRevisionNo + 1,
      amount: input.amount,
      reason: input.reason,
      actorType: input.actorType,
      actorId: input.actorId,
      occurredAt: new Date(),
    });
  }

  static reconstitute(props: BookingQuoteRevisionProps): BookingQuoteRevision {
    return new BookingQuoteRevision(props);
  }
}
