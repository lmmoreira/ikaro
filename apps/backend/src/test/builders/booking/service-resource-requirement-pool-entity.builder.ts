import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ServiceResourceRequirementPoolEntity } from '../../../contexts/booking/infrastructure/entities/service-resource-requirement.entity';

export class ServiceResourceRequirementPoolEntityBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private requirementId = uuidv7();
  private resourceId = uuidv7();

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withRequirementId(requirementId: string): this {
    this.requirementId = requirementId;
    return this;
  }

  withResourceId(resourceId: string): this {
    this.resourceId = resourceId;
    return this;
  }

  build(): ServiceResourceRequirementPoolEntity {
    const e = new ServiceResourceRequirementPoolEntity();
    e.tenantId = this.tenantId;
    e.requirementId = this.requirementId;
    e.resourceId = this.resourceId;
    return e;
  }
}
