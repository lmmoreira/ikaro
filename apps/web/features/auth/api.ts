import type { StaffTenantOption, SwitchTenantResponse, TenantOption } from '@ikaro/types';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

export type { StaffTenantOption };

export class AuthFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Auth request failed (${status})`);
    this.name = 'AuthFetchError';
  }
}

export async function fetchStaffTenants(): Promise<StaffTenantOption[]> {
  const res = await fetch('/api/auth/staff-tenants');
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new AuthFetchError(res.status, body.code, body.field, body.detail);
  }
  return (await res.json()) as StaffTenantOption[];
}

export async function switchStaffTenant(staffId: string): Promise<{ tenantSlug: string }> {
  const res = await fetch('/api/auth/switch-staff-tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId }),
  });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new AuthFetchError(res.status, body.code, body.field, body.detail);
  }
  return (await res.json()) as { tenantSlug: string };
}

export async function fetchCustomerTenants(): Promise<TenantOption[]> {
  const res = await fetch('/api/customers/tenants');
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new AuthFetchError(res.status, body.code, body.field, body.detail);
  }
  return (await res.json()) as TenantOption[];
}

export async function switchTenant(targetTenantId: string): Promise<SwitchTenantResponse> {
  const res = await fetch('/api/auth/switch-tenant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetTenantId }),
  });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new AuthFetchError(res.status, body.code, body.field, body.detail);
  }
  return (await res.json()) as SwitchTenantResponse;
}
