import type { BillingIdentityReadyResponse } from '@ikaro/types';
import type { BillingAccount } from '../../domain/billing-account.aggregate';

// The account as the manager sees it (UC-118). The tax id is the normalised value and its type; a
// manager reads their own, and nothing here is ever logged.
export function toBillingIdentityResponse(account: BillingAccount): BillingIdentityReadyResponse {
  const { taxId, address } = account;
  return {
    provisioning: false,
    taxIdType: taxId?.type ?? null,
    taxId: taxId?.value ?? null,
    legalName: account.legalName,
    billingEmail: account.billingEmail?.address ?? null,
    address: address
      ? {
          street: address.street,
          number: address.number,
          complement: address.complement ?? null,
          neighborhood: address.neighborhood ?? null,
          city: address.city,
          state: address.state,
          zipCode: address.zipCode,
        }
      : null,
  };
}
