import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingScheduleExceptionEntity } from '../../../contexts/booking/infrastructure/entities/recurring-booking-schedule-exception.entity';
import {
  RecurringBookingScheduleActorType,
  RecurringBookingScheduleExceptionKind,
} from '../../../contexts/booking/domain/recurring-booking-schedule.aggregate';

export class RecurringBookingScheduleExceptionEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private recurringScheduleId = uuidv7();
  private occurrenceStart = new Date();
  private kind: RecurringBookingScheduleExceptionKind = 'SKIPPED';
  private replacementBookingId: string | null = null;
  private actorType: RecurringBookingScheduleActorType = 'CUSTOMER';
  private actorId: string | null = uuidv7();
  private reason: string | null = null;
  private readonly createdAt = new Date();

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withRecurringScheduleId(recurringScheduleId: string): this {
    this.recurringScheduleId = recurringScheduleId;
    return this;
  }

  withOccurrenceStart(occurrenceStart: Date): this {
    this.occurrenceStart = occurrenceStart;
    return this;
  }

  withKind(kind: RecurringBookingScheduleExceptionKind): this {
    this.kind = kind;
    return this;
  }

  withReplacementBookingId(replacementBookingId: string | null): this {
    this.replacementBookingId = replacementBookingId;
    return this;
  }

  build(): RecurringBookingScheduleExceptionEntity {
    const e = new RecurringBookingScheduleExceptionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.recurringScheduleId = this.recurringScheduleId;
    e.occurrenceStart = this.occurrenceStart;
    e.kind = this.kind;
    e.replacementBookingId = this.replacementBookingId;
    e.actorType = this.actorType;
    e.actorId = this.actorId;
    e.reason = this.reason;
    e.createdAt = this.createdAt;
    return e;
  }
}
