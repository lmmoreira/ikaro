import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ResourceType } from '../../../contexts/booking/domain/resource.types';
import { ServiceClassResourcePoolEntity } from '../../../contexts/booking/infrastructure/entities/service-class-resource-pool.entity';

export class ServiceClassResourcePoolEntityBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private resourceType: ResourceType = ResourceType.STAFF;
  private resourceId = uuidv7();

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

  withResourceId(resourceId: string): this {
    this.resourceId = resourceId;
    return this;
  }

  build(): ServiceClassResourcePoolEntity {
    const e = new ServiceClassResourcePoolEntity();
    e.tenantId = this.tenantId;
    e.serviceId = this.serviceId;
    e.resourceType = this.resourceType;
    e.resourceId = this.resourceId;
    return e;
  }
}
