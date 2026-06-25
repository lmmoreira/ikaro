import type { SwitchTenantResponse, TenantOption } from '@ikaro/types';

export interface StaffTenantOption {
  readonly staffId: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly role: 'STAFF' | 'MANAGER';
}

export class AuthFetchError extends Error {
  constructor(public readonly status: number) {
    super('Auth request failed');
    this.name = 'AuthFetchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export async function fetchStaffTenants(token: string): Promise<StaffTenantOption[]> {
  const res = await fetch(`/api/auth/staff-tenants?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new AuthFetchError(res.status);
  return (await res.json()) as StaffTenantOption[];
}

export async function selectStaffTenant(
  selectionToken: string,
  staffId: string,
): Promise<{ tenantSlug: string }> {
  const res = await fetch('/api/auth/staff-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selectionToken, staffId }),
  });
  if (!res.ok) throw new AuthFetchError(res.status);
  return (await res.json()) as { tenantSlug: string };
}

export async function fetchCustomerTenants(): Promise<TenantOption[]> {
  const res = await fetch('/api/customers/tenants');
  if (!res.ok) throw new AuthFetchError(res.status);
  return (await res.json()) as TenantOption[];
}

export async function switchTenant(targetTenantId: string): Promise<SwitchTenantResponse> {
  const res = await fetch('/api/auth/switch-tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTenantId }),
  });
  if (!res.ok) throw new AuthFetchError(res.status);
  return (await res.json()) as SwitchTenantResponse;
}
