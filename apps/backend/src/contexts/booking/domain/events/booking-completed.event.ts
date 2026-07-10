import { DomainEvent } from '../../../../shared/domain/domain-event';
import { AddressEventPayload } from './booking-requested.event';

interface BookingCompletedLinePayload {
  lineId: string;
  serviceId: string;
  priceAtBooking: { amount: string; currency: string };
  actualPriceCharged: { amount: string; currency: string };
  pointsValueAtBooking: number;
}

interface BookingCompletedData extends Record<string, unknown> {
  bookingId: string;
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  completedSlot: { startTime: string; endTime: string };
  completedBy: string;
  afterServicePhotoUrls: string[];
  adminNotes: string | null;
  pickupAddress: AddressEventPayload | null;
  totalPrice: { amount: string; currency: string };
  totalActualPrice: { amount: string; currency: string };
  lines: BookingCompletedLinePayload[];
  discountByPoints?: { pointsUsed: number; amountDeducted: { amount: string; currency: string } };
}

export class BookingCompleted extends DomainEvent<BookingCompletedData> {
  readonly eventVersion = 1;
  readonly data: BookingCompletedData;

  constructor(tenantId: string, correlationId: string, data: BookingCompletedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
