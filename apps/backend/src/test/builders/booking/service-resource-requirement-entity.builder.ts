import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';
import { ResourceRequirementSelectionMode } from '../../../contexts/booking/domain/resource-requirement';
import { ServiceResourceRequirementEntity } from '../../../contexts/booking/infrastructure/entities/service-resource-requirement.entity';

export class ServiceResourceRequirementEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private resourceType: ResourceType = ResourceType.LOCATION;
  private selectionMode: ResourceRequirementSelectionMode = 'NONE';
  private requiredQuantity = 1;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withServiceId(serviceId: string): this {
    this.serviceId = serviceId;
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

  build(): ServiceResourceRequirementEntity {
    const e = new ServiceResourceRequirementEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.serviceId = this.serviceId;
    e.resourceType = this.resourceType;
    e.selectionMode = this.selectionMode;
    e.requiredQuantity = this.requiredQuantity;
    return e;
  }
}
