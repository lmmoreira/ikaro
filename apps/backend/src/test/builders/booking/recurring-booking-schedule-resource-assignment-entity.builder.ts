import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../../../contexts/booking/infrastructure/entities/recurring-booking-schedule-resource-assignment.entity';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';

export class RecurringBookingScheduleResourceAssignmentEntityBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private recurringScheduleId = uuidv7();
  private resourceId = uuidv7();
  private requirementId: string | null = null;
  private resourceType: ResourceType = ResourceType.ROOM;
  private requiredQuantityPosition: number | null = null;
  private readonly assignedAt = new Date();

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withRecurringScheduleId(recurringScheduleId: string): this {
    this.recurringScheduleId = recurringScheduleId;
    return this;
  }

  withResourceId(resourceId: string): this {
    this.resourceId = resourceId;
    return this;
  }

  withResourceType(resourceType: ResourceType): this {
    this.resourceType = resourceType;
    return this;
  }

  build(): RecurringBookingScheduleResourceAssignmentEntity {
    const e = new RecurringBookingScheduleResourceAssignmentEntity();
    e.tenantId = this.tenantId;
    e.recurringScheduleId = this.recurringScheduleId;
    e.resourceId = this.resourceId;
    e.requirementId = this.requirementId;
    e.resourceType = this.resourceType;
    e.requiredQuantityPosition = this.requiredQuantityPosition;
    e.assignedAt = this.assignedAt;
    return e;
  }
}
