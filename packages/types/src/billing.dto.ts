import type { ChatbotTier, FeatureKey } from './enums';

// Billing access resolution (M25-S13, UC-120). The backend answers the BFF with the full
// `BackendTenantAccessResponse`; the web only ever sees a role-reduced `BillingAccessResponse`.

export type TenantAccessStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';

export interface TenantAccessFeatureDto {
  key: FeatureKey;
  tier: ChatbotTier | 'STANDARD';
}

/** `GET /v1/billing/access` for a `MANAGER`. */
export interface BillingAccessManagerResponse {
  status: TenantAccessStatus;
  operational: boolean;
  features: TenantAccessFeatureDto[];
}

/** `GET /v1/billing/access` for `STAFF`: no `status`, so staff never learn the tenant is `PAST_DUE`. */
export interface BillingAccessStaffResponse {
  operational: boolean;
  features: TenantAccessFeatureDto[];
}

/** `GET /v1/billing/access` for a `CUSTOMER`: only whether the tenant is operational. */
export interface BillingAccessCustomerResponse {
  operational: boolean;
}

/** No role ever receives the suspension reason or the internal `provisional` / `degraded` markers. */
export type BillingAccessResponse =
  BillingAccessManagerResponse | BillingAccessStaffResponse | BillingAccessCustomerResponse;

/** `GET /internal/billing/suspended-tenant-ids` (backend, internal API key). */
export interface SuspendedTenantIdsResponse {
  tenantIds: string[];
}
