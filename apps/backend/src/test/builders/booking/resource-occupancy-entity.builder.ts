import { uuidv7 } from '../../../shared/domain/uuid-v7';
import {
  ResourceOccupancyEntity,
  ResourceOccupancySourceType,
} from '../../../contexts/booking/infrastructure/entities/resource-occupancy.entity';
import { ResourceOccupancyLockState } from '../../../contexts/booking/domain/resource-occupancy-lock-state';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';

export class ResourceOccupancyEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private resourceId = uuidv7();
  private resourceType: ResourceType = ResourceType.LOCATION;
  private sourceType: ResourceOccupancySourceType = 'BOOKING_LINE';
  private bookingLineResourceAssignmentId: string | null = uuidv7();
  private legIndex: number | null = null;
  private classSessionId: string | null = null;
  private resourceNameAtAssignment = 'Localização Principal';
  private startsAt = new Date('2026-06-01T13:00:00.000Z');
  private endsAt = new Date('2026-06-01T14:00:00.000Z');
  private lockState: ResourceOccupancyLockState = 'COMMITTED';
  private holdExpiresAt: Date | null = null;
  private readonly createdAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
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

  withStartsAt(startsAt: Date): this {
    this.startsAt = startsAt;
    return this;
  }

  withEndsAt(endsAt: Date): this {
    this.endsAt = endsAt;
    return this;
  }

  withLockState(lockState: ResourceOccupancyLockState): this {
    this.lockState = lockState;
    return this;
  }

  withHoldExpiresAt(holdExpiresAt: Date | null): this {
    this.holdExpiresAt = holdExpiresAt;
    return this;
  }

  withResourceNameAtAssignment(resourceNameAtAssignment: string): this {
    this.resourceNameAtAssignment = resourceNameAtAssignment;
    return this;
  }

  withSourceType(sourceType: ResourceOccupancySourceType): this {
    this.sourceType = sourceType;
    return this;
  }

  withBookingLineResourceAssignmentId(bookingLineResourceAssignmentId: string | null): this {
    this.bookingLineResourceAssignmentId = bookingLineResourceAssignmentId;
    return this;
  }

  withLegIndex(legIndex: number | null): this {
    this.legIndex = legIndex;
    return this;
  }

  withClassSessionId(classSessionId: string | null): this {
    this.classSessionId = classSessionId;
    return this;
  }

  build(): ResourceOccupancyEntity {
    const entity = new ResourceOccupancyEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.resourceId = this.resourceId;
    entity.resourceType = this.resourceType;
    entity.sourceType = this.sourceType;
    entity.bookingLineResourceAssignmentId = this.bookingLineResourceAssignmentId;
    entity.legIndex = this.legIndex;
    entity.classSessionId = this.classSessionId;
    entity.resourceNameAtAssignment = this.resourceNameAtAssignment;
    entity.startsAt = this.startsAt;
    entity.endsAt = this.endsAt;
    entity.lockState = this.lockState;
    entity.holdExpiresAt = this.holdExpiresAt;
    entity.createdAt = this.createdAt;
    return entity;
  }
}
