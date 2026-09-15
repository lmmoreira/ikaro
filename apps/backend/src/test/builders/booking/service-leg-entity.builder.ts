import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ServiceLegEntity } from '../../../contexts/booking/infrastructure/entities/service-leg.entity';

export class ServiceLegEntityBuilder {
  private id = uuidv7();
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private serviceId = uuidv7();
  private legIndex = 0;
  private name = 'Etapa 1';
  private durationMinutes = 30;
  private transitionGapAfterMinutes = 0;

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

  withLegIndex(legIndex: number): this {
    this.legIndex = legIndex;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withDurationMinutes(durationMinutes: number): this {
    this.durationMinutes = durationMinutes;
    return this;
  }

  withTransitionGapAfterMinutes(transitionGapAfterMinutes: number): this {
    this.transitionGapAfterMinutes = transitionGapAfterMinutes;
    return this;
  }

  build(): ServiceLegEntity {
    const e = new ServiceLegEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.serviceId = this.serviceId;
    e.legIndex = this.legIndex;
    e.name = this.name;
    e.durationMinutes = this.durationMinutes;
    e.transitionGapAfterMinutes = this.transitionGapAfterMinutes;
    return e;
  }
}
