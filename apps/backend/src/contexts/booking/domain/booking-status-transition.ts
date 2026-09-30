import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export type BookingStatusTransitionActorType =
  'STAFF' | 'MANAGER' | 'CUSTOMER' | 'GUEST' | 'SYSTEM';

export interface BookingStatusTransitionProps {
  id: string;
  tenantId: string;
  bookingId: string;
  fromStatus: string;
  toStatus: string;
  reason: string | null;
  actorType: BookingStatusTransitionActorType;
  actorId: string | null;
  occurredAt: Date;
  correlationId: string;
}

export interface RecordBookingStatusTransitionInput {
  tenantId: string;
  bookingId: string;
  fromStatus: string;
  toStatus: string;
  reason?: string | null;
  actorType: BookingStatusTransitionActorType;
  actorId: string | null;
  correlationId: string;
}

// M23 Cluster 3 (UC-074) — one append-only row per booking status change, written in the same
// transaction as the booking's own save. Same shape as BookingQuoteRevision: an independent
// aggregate root with its own repository, rows are never edited or deleted (docs/13-DATABASE_SCHEMA.md
// § booking_status_transitions). M23-S09 records the no-show and its correction; M23-S26 makes
// every other transition append here too, so until then the table is deliberately partial.
export class BookingStatusTransition extends AggregateRoot {
  private readonly props: BookingStatusTransitionProps;

  private constructor(props: BookingStatusTransitionProps) {
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
  get fromStatus(): string {
    return this.props.fromStatus;
  }
  get toStatus(): string {
    return this.props.toStatus;
  }
  get reason(): string | null {
    return this.props.reason;
  }
  get actorType(): BookingStatusTransitionActorType {
    return this.props.actorType;
  }
  get actorId(): string | null {
    return this.props.actorId;
  }
  get occurredAt(): Date {
    return this.props.occurredAt;
  }
  get correlationId(): string {
    return this.props.correlationId;
  }

  static record(input: RecordBookingStatusTransitionInput): BookingStatusTransition {
    return new BookingStatusTransition({
      id: uuidv7(),
      tenantId: input.tenantId,
      bookingId: input.bookingId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      actorType: input.actorType,
      actorId: input.actorId,
      occurredAt: new Date(),
      correlationId: input.correlationId,
    });
  }

  static reconstitute(props: BookingStatusTransitionProps): BookingStatusTransition {
    return new BookingStatusTransition(props);
  }
}
