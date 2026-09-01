import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ResourceEntity } from '../../../contexts/booking/infrastructure/entities/resource.entity';
import {
  ResourceType,
  ResourceWorkingHours,
} from '../../../contexts/booking/domain/resource.types';

export class ResourceEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private type: ResourceType = ResourceType.ROOM;
  private refId: string | null = null;
  private name = 'Estúdio 1';
  private workingHours: ResourceWorkingHours | null = null;
  private turnoverMinutes = 0;
  private maxCapacity: number | null = null;
  private isActive = true;
  private createdAt = new Date('2026-01-01T00:00:00Z');
  private updatedAt = new Date('2026-01-01T00:00:00Z');

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withType(type: ResourceType): this {
    this.type = type;
    return this;
  }

  withRefId(refId: string | null): this {
    this.refId = refId;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withWorkingHours(workingHours: ResourceWorkingHours | null): this {
    this.workingHours = workingHours;
    return this;
  }

  withTurnoverMinutes(turnoverMinutes: number): this {
    this.turnoverMinutes = turnoverMinutes;
    return this;
  }

  withMaxCapacity(maxCapacity: number | null): this {
    this.maxCapacity = maxCapacity;
    return this;
  }

  withIsActive(isActive: boolean): this {
    this.isActive = isActive;
    return this;
  }

  build(): ResourceEntity {
    const entity = new ResourceEntity();
    entity.id = this.id;
    entity.tenantId = this.tenantId;
    entity.type = this.type;
    entity.refId = this.refId;
    entity.name = this.name;
    entity.workingHours = this.workingHours;
    entity.turnoverMinutes = this.turnoverMinutes;
    entity.maxCapacity = this.maxCapacity;
    entity.isActive = this.isActive;
    entity.createdAt = this.createdAt;
    entity.updatedAt = this.updatedAt;
    return entity;
  }
}
