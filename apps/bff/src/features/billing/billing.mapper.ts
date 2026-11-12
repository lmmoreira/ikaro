import type { ActorRole, BillingAccessResponse } from '@ikaro/types';
import { FEATURE_KEYS } from '@ikaro/validation';
import type { BackendTenantAccess } from './billing.types';

// What the BFF assumes when the backend lookup itself failed (UC-120 A2, fail open): an operational
// tenant with every sellable feature, chatbot at `BASIC`, exactly what a trial grants.
export function failOpenBackendAccess(): BackendTenantAccess {
  return {
    status: 'ACTIVE',
    operational: true,
    features: FEATURE_KEYS.map((key) => ({ key, tier: key === 'CHATBOT' ? 'BASIC' : 'STANDARD' })),
  };
}

// The role reduction (M25-S13, docs/API_CONTRACTS.md § Billing — Access Resolution): a manager runs
// the account and sees the status; staff see what is locked but never the payment state; a customer
// only learns whether the tenant is operational. Built field by field, never by spreading the
// backend answer, so nothing else can leak through.
export function toBillingAccessResponse(
  role: ActorRole,
  access: BackendTenantAccess,
): BillingAccessResponse {
  switch (role) {
    case 'MANAGER':
      return { status: access.status, operational: access.operational, features: access.features };
    case 'STAFF':
      return { operational: access.operational, features: access.features };
    case 'CUSTOMER':
      return { operational: access.operational };
  }
}
