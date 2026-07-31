import type { SwitchTenantRequest, SwitchTenantResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export async function logout(): Promise<void> {
  await bffClient.post('/auth/logout', {});
}

export async function switchTenant(body: SwitchTenantRequest): Promise<SwitchTenantResponse> {
  const res = await bffClient.post<SwitchTenantResponse>('/auth/switch-tenant', body);
  return res.data;
}
