import type { FeatureKey } from '@ikaro/validation';
import { DomainEvent } from '../../../../shared/domain/domain-event';

/**
 * What the provisioning caller asked of Billing (UC-110). Present on the event only when the
 * caller sent `exempt: true`, a feature subset or a registration; never carries a tax id.
 */
export interface TenantBillingHint {
  exempt: boolean;
  features?: FeatureKey[];
  registrationId?: string;
}

interface TenantProvisionedData extends Record<string, unknown> {
  name: string;
  slug: string;
  adminEmail: string;
  timezone: string;
  countryCode: string;
  billingHint?: TenantBillingHint;
}

export class TenantProvisioned extends DomainEvent<TenantProvisionedData> {
  readonly eventVersion = 1;
  readonly data: TenantProvisionedData;

  constructor(tenantId: string, correlationId: string, data: TenantProvisionedData) {
    super(tenantId, correlationId);
    this.data = data;
  }
}
