import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';
import { ResourceRequirementSelectionMode } from '../../../contexts/booking/domain/resource-requirement';
import { ServiceLegResourceRequirementEntity } from '../../../contexts/booking/infrastructure/entities/service-leg.entity';

export class ServiceLegResourceRequirementEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private legId = uuidv7();
  private resourceType: ResourceType = ResourceType.STAFF;
  private selectionMode: ResourceRequirementSelectionMode = 'CUSTOMER_CHOICE';
  private requiredQuantity = 1;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withLegId(legId: string): this {
    this.legId = legId;
    return this;
  }

  withResourceType(resourceType: ResourceType): this {
    this.resourceType = resourceType;
    return this;
  }

  withSelectionMode(selectionMode: ResourceRequirementSelectionMode): this {
    this.selectionMode = selectionMode;
    return this;
  }

  withRequiredQuantity(requiredQuantity: number): this {
    this.requiredQuantity = requiredQuantity;
    return this;
  }

  build(): ServiceLegResourceRequirementEntity {
    const e = new ServiceLegResourceRequirementEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.legId = this.legId;
    e.resourceType = this.resourceType;
    e.selectionMode = this.selectionMode;
    e.requiredQuantity = this.requiredQuantity;
    return e;
  }
}
