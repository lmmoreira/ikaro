import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingStatusTransitionEntity } from '../../../contexts/booking/infrastructure/entities/booking-status-transition.entity';

export class BookingStatusTransitionEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private bookingId = uuidv7();
  private fromStatus = 'APPROVED';
  private toStatus = 'NO_SHOW';
  private reason: string | null = null;
  private actorType = 'STAFF';
  private actorId: string | null = uuidv7();
  private occurredAt = new Date('2026-01-01T00:00:00Z');
  private correlationId = uuidv7();

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

  withFromStatus(fromStatus: string): this {
    this.fromStatus = fromStatus;
    return this;
  }

  withToStatus(toStatus: string): this {
    this.toStatus = toStatus;
    return this;
  }

  withReason(reason: string | null): this {
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

  withOccurredAt(occurredAt: Date): this {
    this.occurredAt = occurredAt;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  build(): BookingStatusTransitionEntity {
    const e = new BookingStatusTransitionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.bookingId = this.bookingId;
    e.fromStatus = this.fromStatus;
    e.toStatus = this.toStatus;
    e.reason = this.reason;
    e.actorType = this.actorType;
    e.actorId = this.actorId;
    e.occurredAt = this.occurredAt;
    e.correlationId = this.correlationId;
    return e;
  }
}
