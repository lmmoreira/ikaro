import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Money } from '../../../shared/value-objects/money';

export interface BookingLineProps {
  lineId: string;
  bookingId: string;
  tenantId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: Money;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
  actualPriceCharged: Money | null;
}

export interface BookingLineInput {
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: Money;
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

export class BookingLine {
  private readonly props: BookingLineProps;

  private constructor(props: BookingLineProps) {
    this.props = props;
  }

  get lineId(): string {
    return this.props.lineId;
  }
  get bookingId(): string {
    return this.props.bookingId;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  get serviceNameAtBooking(): string {
    return this.props.serviceNameAtBooking;
  }
  get priceAtBooking(): Money {
    return this.props.priceAtBooking;
  }
  get durationMinsAtBooking(): number {
    return this.props.durationMinsAtBooking;
  }
  get pointsValueAtBooking(): number {
    return this.props.pointsValueAtBooking;
  }
  get requiresPickupAddressAtBooking(): boolean {
    return this.props.requiresPickupAddressAtBooking;
  }
  get actualPriceCharged(): Money | null {
    return this.props.actualPriceCharged;
  }

  setActualPrice(price: Money): void {
    this.props.actualPriceCharged = price;
  }

  // M23-S03 — a variable-duration reschedule (durationMinutes in the request body) re-quotes this
  // line via BookingQuoteService before Booking.reschedule() recomputes totalDurationMins/totalPrice.
  updateDurationAndPrice(durationMinutes: number, priceAtBooking: Money): void {
    this.props.durationMinsAtBooking = durationMinutes;
    this.props.priceAtBooking = priceAtBooking;
  }

  static create(bookingId: string, tenantId: string, input: BookingLineInput): BookingLine {
    return new BookingLine({
      lineId: uuidv7(),
      bookingId,
      tenantId,
      serviceId: input.serviceId,
      serviceNameAtBooking: input.serviceNameAtBooking,
      priceAtBooking: input.priceAtBooking,
      durationMinsAtBooking: input.durationMinsAtBooking,
      pointsValueAtBooking: input.pointsValueAtBooking,
      requiresPickupAddressAtBooking: input.requiresPickupAddressAtBooking,
      actualPriceCharged: null,
    });
  }

  static reconstitute(props: BookingLineProps): BookingLine {
    return new BookingLine(props);
  }
}
