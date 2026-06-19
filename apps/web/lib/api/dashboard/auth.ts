import { bffClient } from '../bff-client';

export interface SwitchTenantRequest {
  readonly tenantId: string;
}

export interface SwitchTenantResponse {
  readonly tenantSlug: string;
  readonly expiresIn: string;
}

export async function logout(): Promise<void> {
  await bffClient.post('/auth/logout', {});
}

export async function switchTenant(body: SwitchTenantRequest): Promise<SwitchTenantResponse> {
  const res = await bffClient.post<SwitchTenantResponse>('/auth/switch-tenant', body);
  return res.data;
}
