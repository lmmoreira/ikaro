import { DomainEvent } from '../../../../shared/domain/domain-event';

interface TenantProvisionedData extends Record<string, unknown> {
  name: string;
  slug: string;
  adminEmail: string;
  timezone: string;
  countryCode: string;
  /**
   * The Billing registration reserved before the tenant (UC-024, UC-127). It holds the billing
   * intent (exempt flag, tax identity, terms), so none of that travels in the event.
   */
  registrationId: string;
}

export class TenantProvisioned extends DomainEvent<TenantProvisionedData> {
  readonly eventVersion = 1;
  readonly data: TenantProvisionedData;

  constructor(tenantId: string, correlationId: string, data: TenantProvisionedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
