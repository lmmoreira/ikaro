import type { TenantOption } from '@ikaro/types';
import type { CustomerTenantSummaryResponse } from '../auth/auth.types';
import type { TenantInfoResponse } from '../shared/types/backend-responses';

export function toTenantOption(
  tenant: CustomerTenantSummaryResponse,
  tenantInfo: TenantInfoResponse,
  balance: { currentPoints: number },
): TenantOption {
  return {
    id: tenant.tenantId,
    name: tenantInfo.name,
    slug: tenantInfo.slug,
    loyaltyPoints: balance.currentPoints,
  };
}
