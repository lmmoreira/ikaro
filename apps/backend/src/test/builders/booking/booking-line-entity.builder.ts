import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingLineEntity } from '../../../contexts/booking/infrastructure/entities/booking-line.entity';

export class BookingLineEntityBuilder {
  private lineId = uuidv7();
  private bookingId = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private serviceNameAtBooking = 'Lavagem Básica';
  private priceAtBookingAmount = '100.00';
  private durationMinsAtBooking = 30;
  private pointsValueAtBooking = 1;
  private requiresPickupAddressAtBooking = false;
  private actualPriceChargedAmount: string | null = null;

  withLineId(lineId: string): this {
    this.lineId = lineId;
    return this;
  }
  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }
  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }
  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
    return this;
  }
  withServiceNameAtBooking(name: string): this {
    this.serviceNameAtBooking = name;
    return this;
  }
  withPriceAtBookingAmount(amount: string): this {
    this.priceAtBookingAmount = amount;
    return this;
  }
  withDurationMinsAtBooking(mins: number): this {
    this.durationMinsAtBooking = mins;
    return this;
  }
  withPointsValueAtBooking(points: number): this {
    this.pointsValueAtBooking = points;
    return this;
  }
  withRequiresPickupAddressAtBooking(v: boolean): this {
    this.requiresPickupAddressAtBooking = v;
    return this;
  }
  withActualPriceChargedAmount(amount: string | null): this {
    this.actualPriceChargedAmount = amount;
    return this;
  }

  build(): BookingLineEntity {
    const entity = new BookingLineEntity();
    entity.lineId = this.lineId;
    entity.bookingId = this.bookingId;
    entity.tenantId = this.tenantId;
    entity.serviceId = this.serviceId;
    entity.serviceNameAtBooking = this.serviceNameAtBooking;
    entity.priceAtBookingAmount = this.priceAtBookingAmount;
    entity.durationMinsAtBooking = this.durationMinsAtBooking;
    entity.pointsValueAtBooking = this.pointsValueAtBooking;
    entity.requiresPickupAddressAtBooking = this.requiresPickupAddressAtBooking;
    entity.actualPriceChargedAmount = this.actualPriceChargedAmount;
    return entity;
  }
}
