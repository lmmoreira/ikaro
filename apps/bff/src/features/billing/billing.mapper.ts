import type { ActorRole, BillingAccessResponse } from '@ikaro/types';
import type { BackendTenantAccess } from './billing.types';

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
