import { ClosureReason } from '../../../contexts/booking/domain/schedule-closure.aggregate';
import { ScheduleClosureEntity } from '../../../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ScheduleClosureEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private resourceId: string | null = null;
  private date = '2026-12-25';
  private startTime: string | null = null;
  private endTime: string | null = null;
  private reason: ClosureReason = ClosureReason.HOLIDAY;
  private notes: string | null = null;
  private createdBy = '00000000-0000-7000-8000-000000000002';
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withResourceId(resourceId: string | null): this {
    this.resourceId = resourceId;
    return this;
  }

  withDate(date: string): this {
    this.date = date;
    return this;
  }

  withStartTime(startTime: string | null): this {
    this.startTime = startTime;
    return this;
  }

  withEndTime(endTime: string | null): this {
    this.endTime = endTime;
    return this;
  }

  withReason(reason: ClosureReason): this {
    this.reason = reason;
    return this;
  }

  withNotes(notes: string | null): this {
    this.notes = notes;
    return this;
  }

  withCreatedBy(createdBy: string): this {
    this.createdBy = createdBy;
    return this;
  }

  build(): ScheduleClosureEntity {
    const e = new ScheduleClosureEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.resourceId = this.resourceId;
    e.date = this.date;
    e.startTime = this.startTime;
    e.endTime = this.endTime;
    e.reason = this.reason;
    e.notes = this.notes;
    e.createdBy = this.createdBy;
    e.createdAt = this.createdAt;
    return e;
  }
}
