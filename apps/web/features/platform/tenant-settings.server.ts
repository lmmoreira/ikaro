import 'server-only';
import type { HotsiteAdminContentResponse, TenantSettingsResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

// Server-side only — the editor must never pre-fill stale values after a save, same rationale
// as fetchTenantSettingsFresh.
export async function fetchHotsiteConfig(token: string): Promise<HotsiteAdminContentResponse> {
  const res = await bffServerFetch(token, '/tenants/hotsite', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch hotsite config (${res.status})`);
  return res.json() as Promise<HotsiteAdminContentResponse>;
}

// Server-side only — reads the auth cookie directly (called from layout server components).
export async function fetchTenantSettings(token: string): Promise<TenantSettingsResponse> {
  const res = await bffServerFetch(token, '/tenants/settings', {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Failed to fetch tenant settings (${res.status})`);
  return res.json() as Promise<TenantSettingsResponse>;
}

// Server-side, uncached — the settings form must never pre-fill stale values after a save.
export async function fetchTenantSettingsFresh(token: string): Promise<TenantSettingsResponse> {
  const res = await bffServerFetch(token, '/tenants/settings', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch tenant settings (${res.status})`);
  return res.json() as Promise<TenantSettingsResponse>;
}
