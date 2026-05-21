import { TenantContext } from '../../shared/tenant/tenant-context';

export class TenantContextBuilder {
  private tenantId = '10000000-0000-4000-8000-000000000001';
  private correlationId = 'corr-test';
  private actorId: string | undefined = undefined;
  private actorType: 'STAFF' | 'CUSTOMER' | undefined = undefined;
  private actorRole: string | undefined = undefined;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withCorrelationId(correlationId: string): this {
    this.correlationId = correlationId;
    return this;
  }

  withActorId(actorId: string): this {
    this.actorId = actorId;
    return this;
  }

  withActorType(actorType: 'STAFF' | 'CUSTOMER'): this {
    this.actorType = actorType;
    return this;
  }

  withActorRole(actorRole: string): this {
    this.actorRole = actorRole;
    return this;
  }

  build(): TenantContext {
    return {
      tenantId: this.tenantId,
      correlationId: this.correlationId,
      actorId: this.actorId,
      actorType: this.actorType,
      actorRole: this.actorRole,
    };
  }
}
