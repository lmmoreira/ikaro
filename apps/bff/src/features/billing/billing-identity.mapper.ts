import type { BillingIdentityReadyResponse, BillingIdentityResponse } from '@ikaro/types';
import type { BackendBillingIdentity, BackendBillingIdentitySaved } from './billing.types';

// The billing identity (M26-S16, UC-118): plain functions from the backend's answer, parsed at the
// boundary, to the public response types. Kept beside `billing.mapper.ts` (a second mapper file,
// as `billing-payment.mapper.ts` is) so neither passes the file-size cap. The tax id is the
// backend's normalised value; the web formats it, and no display string is built here.

/** The saved identity, field by field (the parse already dropped anything undeclared). */
export function toBillingIdentitySavedResponse(
  backend: BackendBillingIdentitySaved,
): BillingIdentityReadyResponse {
  return {
    provisioning: false,
    taxIdType: backend.taxIdType,
    taxId: backend.taxId,
    legalName: backend.legalName,
    billingEmail: backend.billingEmail,
    address: backend.address ? { ...backend.address } : null,
  };
}

/** The read: the provisioning window is its own answer, the identity otherwise. */
export function toBillingIdentityResponse(
  backend: BackendBillingIdentity,
): BillingIdentityResponse {
  if (backend.provisioning) return { provisioning: true };
  return toBillingIdentitySavedResponse(backend);
}
