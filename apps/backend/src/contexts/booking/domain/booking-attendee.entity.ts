import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { normalizeText } from '../../../shared/utils/text-normalization';
import { BookingAttendeeNameRequiredError } from './errors/booking-domain.error';

// UC-068 — an optional named attendee on a booking, populated only when the effective intake
// schema's requiresNamedAttendees is true (docs/13-DATABASE_SCHEMA.md § booking_attendees).
// customerId always starts null at booking-request time: linking an attendee to an existing
// Customer record isn't part of this story's scope (no AC covers it) — a guardian booking for a
// minor is the booker, not a family-account hierarchy (UC-068 A2).
export interface BookingAttendeeProps {
  id: string;
  bookingId: string;
  tenantId: string;
  name: string;
  customerId: string | null;
  isMinor: boolean;
}

export interface BookingAttendeeInput {
  name: string;
  isMinor?: boolean;
}

export class BookingAttendee {
  private readonly props: BookingAttendeeProps;

  private constructor(props: BookingAttendeeProps) {
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get bookingId(): string {
    return this.props.bookingId;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get name(): string {
    return this.props.name;
  }
  get customerId(): string | null {
    return this.props.customerId;
  }
  get isMinor(): boolean {
    return this.props.isMinor;
  }

  static create(bookingId: string, tenantId: string, input: BookingAttendeeInput): BookingAttendee {
    const name = normalizeText(input.name);
    if (!name) throw new BookingAttendeeNameRequiredError();
    return new BookingAttendee({
      id: uuidv7(),
      bookingId,
      tenantId,
      name,
      customerId: null,
      isMinor: input.isMinor ?? false,
    });
  }

  static reconstitute(props: BookingAttendeeProps): BookingAttendee {
    return new BookingAttendee(props);
  }
}
