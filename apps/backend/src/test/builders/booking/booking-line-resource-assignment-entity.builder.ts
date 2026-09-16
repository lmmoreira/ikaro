import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { BookingLineResourceAssignmentEntity } from '../../../contexts/booking/infrastructure/entities/booking-line-resource-assignment.entity';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';

export class BookingLineResourceAssignmentEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private bookingLineId = uuidv7();
  private resourceId = uuidv7();
  private resourceType: ResourceType = ResourceType.LOCATION;
  private legIndex: number | null = null;
  private quantityPosition: number | null = null;
  private resourceNameAtAssignment = 'Localização Principal';
  private readonly assignedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withBookingLineId(bookingLineId: string): this {
    this.bookingLineId = bookingLineId;
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

  withLegIndex(legIndex: number | null): this {
    this.legIndex = legIndex;
    return this;
  }

  build(): BookingLineResourceAssignmentEntity {
    const entity = new BookingLineResourceAssignmentEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.bookingLineId = this.bookingLineId;
    entity.resourceId = this.resourceId;
    entity.resourceType = this.resourceType;
    entity.legIndex = this.legIndex;
    entity.quantityPosition = this.quantityPosition;
    entity.resourceNameAtAssignment = this.resourceNameAtAssignment;
    entity.assignedAt = this.assignedAt;
    return entity;
  }
}
