import { ScheduleOpening } from '../../../contexts/booking/domain/schedule-opening.aggregate';

export class ScheduleOpeningBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private resourceId: string | undefined = undefined;
  private date: string = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  private startTime = '09:00';
  private endTime = '14:00';
  private createdBy = '00000000-0000-7000-8000-000000000002';
  private notes: string | undefined = undefined;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withResourceId(resourceId: string): this {
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

  withCreatedBy(createdBy: string): this {
    this.createdBy = createdBy;
    return this;
  }

  withNotes(notes: string): this {
    this.notes = notes;
    return this;
  }

  build(): ScheduleOpening {
    return ScheduleOpening.open({
      tenantId: this.tenantId,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      createdBy: this.createdBy,
      resourceId: this.resourceId,
      notes: this.notes,
    });
  }
}
