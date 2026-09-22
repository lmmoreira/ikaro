import { ScheduleOpeningEntity } from '../../../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class ScheduleOpeningEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private resourceId: string | null = null;
  private date = '2026-12-28';
  private startTime = '09:00';
  private endTime = '14:00';
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

  withStartTime(startTime: string): this {
    this.startTime = startTime;
    return this;
  }

  withEndTime(endTime: string): this {
    this.endTime = endTime;
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

  build(): ScheduleOpeningEntity {
    const e = new ScheduleOpeningEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.resourceId = this.resourceId;
    e.date = this.date;
    e.startTime = this.startTime;
    e.endTime = this.endTime;
    e.notes = this.notes;
    e.createdBy = this.createdBy;
    e.createdAt = this.createdAt;
    return e;
  }
}
