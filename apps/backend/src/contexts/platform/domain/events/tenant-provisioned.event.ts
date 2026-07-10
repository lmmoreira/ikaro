import { DomainEvent } from '../../../../shared/domain/domain-event';

interface TenantProvisionedData extends Record<string, unknown> {
  name: string;
  slug: string;
  adminEmail: string;
  timezone: string;
}

export class TenantProvisioned extends DomainEvent<TenantProvisionedData> {
  readonly eventVersion = 1;
  readonly data: TenantProvisionedData;

  constructor(tenantId: string, correlationId: string, data: TenantProvisionedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
