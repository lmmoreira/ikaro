import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingAttendeeEntity } from '../../../contexts/booking/infrastructure/entities/booking-attendee.entity';

export class BookingAttendeeEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private bookingId = uuidv7();
  private name = 'Convidado';
  private customerId: string | null = null;
  private isMinor = false;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withBookingId(bookingId: string): this {
    this.bookingId = bookingId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withCustomerId(customerId: string | null): this {
    this.customerId = customerId;
    return this;
  }

  withIsMinor(isMinor: boolean): this {
    this.isMinor = isMinor;
    return this;
  }

  build(): BookingAttendeeEntity {
    const e = new BookingAttendeeEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.bookingId = this.bookingId;
    e.name = this.name;
    e.customerId = this.customerId;
    e.isMinor = this.isMinor;
    return e;
  }
}
