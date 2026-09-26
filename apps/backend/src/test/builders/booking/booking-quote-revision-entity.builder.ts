import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingQuoteRevisionEntity } from '../../../contexts/booking/infrastructure/entities/booking-quote-revision.entity';

export class BookingQuoteRevisionEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private bookingId: string | null = uuidv7();
  private readonly classSessionBookingId: string | null = null;
  private revisionNo = 1;
  private amount = '80.00';
  private readonly currency = 'BRL';
  private reason = 'RESCHEDULE_DURATION_CHANGE';
  private actorType = 'CUSTOMER';
  private actorId: string | null = uuidv7();
  private readonly occurredAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withBookingId(bookingId: string | null): this {
    this.bookingId = bookingId;
    return this;
  }

  withRevisionNo(revisionNo: number): this {
    this.revisionNo = revisionNo;
    return this;
  }

  withAmount(amount: string): this {
    this.amount = amount;
    return this;
  }

  withReason(reason: string): this {
    this.reason = reason;
    return this;
  }

  withActorType(actorType: string): this {
    this.actorType = actorType;
    return this;
  }

  withActorId(actorId: string | null): this {
    this.actorId = actorId;
    return this;
  }

  build(): BookingQuoteRevisionEntity {
    const e = new BookingQuoteRevisionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.bookingId = this.bookingId;
    e.classSessionBookingId = this.classSessionBookingId;
    e.revisionNo = this.revisionNo;
    e.amount = this.amount;
    e.currency = this.currency;
    e.reason = this.reason;
    e.actorType = this.actorType;
    e.actorId = this.actorId;
    e.occurredAt = this.occurredAt;
    return e;
  }
}
