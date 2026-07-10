import { DomainEvent } from '../../../../shared/domain/domain-event';

export interface AddressEventPayload {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
}

export interface BookingLineEventPayload {
  lineId: string;
  serviceId: string;
  serviceNameAtBooking: string;
  priceAtBooking: { amount: string; currency: string };
  durationMinsAtBooking: number;
  pointsValueAtBooking: number;
  requiresPickupAddressAtBooking: boolean;
}

interface BookingRequestedData extends Record<string, unknown> {
  bookingId: string;
  type: 'GUEST' | 'CUSTOMER';
  customerId: string | null;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  contactAddress: AddressEventPayload | null;
  scheduledAt: string;
  totalDurationMins: number;
  totalPrice: { amount: string; currency: string };
  requiresPickup: boolean;
  pickupAddress: AddressEventPayload | null;
  lines: BookingLineEventPayload[];
  beforeServicePhotoUrls: string[];
}

export class BookingRequested extends DomainEvent<BookingRequestedData> {
  readonly eventVersion = 1;
  readonly data: BookingRequestedData;

  constructor(tenantId: string, correlationId: string, data: BookingRequestedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
