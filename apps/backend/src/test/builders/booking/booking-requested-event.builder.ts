import {
  AddressEventPayload,
  BookingLineEventPayload,
  BookingRequested,
} from '../../../contexts/booking/domain/events/booking-requested.event';

export class BookingRequestedEventBuilder {
  private tenantId = 'aaaaaaaa-0000-4000-8000-000000000001';
  private correlationId = 'corr-1';
  private readonly bookingId = 'dddddddd-0000-4000-8000-000000000001';
  private readonly type: 'GUEST' | 'CUSTOMER' = 'GUEST';
  private readonly customerId: string | null = null;
  private contactEmail = 'joao@example.com';
  private contactName = 'João Silva';
  private readonly contactPhone = '+5531999999999';
  private readonly contactAddress: AddressEventPayload | null = null;
  private scheduledAt = '2026-06-15T13:00:00.000Z';
  private readonly totalDurationMins = 60;
  private totalPrice = { amount: '150.00', currency: 'BRL' };
  private readonly requiresPickup = false;
  private pickupAddress: AddressEventPayload | null = null;
  private lines: BookingLineEventPayload[] = [
    {
      lineId: 'eeeeeeee-0000-4000-8000-000000000001',
      serviceId: 'ffffffff-0000-4000-8000-000000000001',
      serviceNameAtBooking: 'Lavagem Completa',
      priceAtBooking: { amount: '150.00', currency: 'BRL' },
      durationMinsAtBooking: 60,
      pointsValueAtBooking: 1,
      requiresPickupAddressAtBooking: false,
    },
  ];
  private readonly beforeServicePhotoUrls: string[] = [];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withContactEmail(contactEmail: string): this {
    this.contactEmail = contactEmail;
    return this;
  }

  withContactName(contactName: string): this {
    this.contactName = contactName;
    return this;
  }

  withScheduledAt(scheduledAt: string): this {
    this.scheduledAt = scheduledAt;
    return this;
  }

  withTotalPrice(totalPrice: { amount: string; currency: string }): this {
    this.totalPrice = totalPrice;
    return this;
  }

  withLines(lines: BookingLineEventPayload[]): this {
    this.lines = lines;
    return this;
  }

  withPickupAddress(pickupAddress: AddressEventPayload | null): this {
    this.pickupAddress = pickupAddress;
    return this;
  }

  build(): BookingRequested {
    return new BookingRequested(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      type: this.type,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      contactPhone: this.contactPhone,
      contactAddress: this.contactAddress,
      scheduledAt: this.scheduledAt,
      totalDurationMins: this.totalDurationMins,
      totalPrice: this.totalPrice,
      requiresPickup: this.requiresPickup,
      pickupAddress: this.pickupAddress,
      lines: this.lines,
      beforeServicePhotoUrls: this.beforeServicePhotoUrls,
    });
  }
}
