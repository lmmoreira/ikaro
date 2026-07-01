import { BookingCompleted } from '../../../contexts/booking/domain/events/booking-completed.event';

export class BookingCompletedEventBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private correlationId = '00000000-0000-7000-8000-000000000099';
  private bookingId = '00000000-0000-7000-8000-000000000020';
  private customerId: string | null = '00000000-0000-7000-8000-000000000030';
  private contactEmail = 'test@example.com';
  private contactName = 'Test User';
  private completedBy = '00000000-0000-7000-8000-000000000050';
  private discountByPoints:
    | {
        pointsUsed: number;
        amountDeducted: { amount: string; currency: string };
      }
    | undefined;
  private readonly completedSlot = {
    startTime: '2026-06-01T10:00:00Z',
    endTime: '2026-06-01T11:00:00Z',
  };
  private readonly totalPrice = { amount: '100.00', currency: 'BRL' };
  private readonly totalActualPrice = { amount: '100.00', currency: 'BRL' };
  private readonly lines = [
    {
      lineId: '00000000-0000-7000-8000-000000000060',
      serviceId: '00000000-0000-7000-8000-000000000070',
      priceAtBooking: { amount: '100.00', currency: 'BRL' },
      actualPriceCharged: { amount: '100.00', currency: 'BRL' },
      pointsValueAtBooking: 10,
    },
  ];

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
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

  withCompletedBy(completedBy: string): this {
    this.completedBy = completedBy;
    return this;
  }

  withDiscountByPoints(
    discountByPoints:
      | {
          pointsUsed: number;
          amountDeducted: { amount: string; currency: string };
        }
      | undefined,
  ): this {
    this.discountByPoints = discountByPoints;
    return this;
  }

  build(): BookingCompleted {
    return new BookingCompleted(this.tenantId, this.correlationId, {
      bookingId: this.bookingId,
      customerId: this.customerId,
      contactEmail: this.contactEmail,
      contactName: this.contactName,
      completedSlot: this.completedSlot,
      completedBy: this.completedBy,
      afterServicePhotoUrls: [],
      adminNotes: null,
      pickupAddress: null,
      totalPrice: this.totalPrice,
      totalActualPrice: this.totalActualPrice,
      lines: this.lines,
      discountByPoints: this.discountByPoints,
    });
  }
}
