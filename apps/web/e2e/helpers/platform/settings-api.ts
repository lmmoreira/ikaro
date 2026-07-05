import type { APIResponse, Page } from '@playwright/test';
import type { TenantSettingsResponse, UpdateTenantSettingsRequest } from '@ikaro/types';
import { BFF_URL } from '../auth/shared';

async function readSettingsResponse(
  res: APIResponse,
  action: string,
): Promise<TenantSettingsResponse> {
  if (!res.ok()) {
    throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as TenantSettingsResponse;
}

export async function getTenantSettings(page: Page): Promise<TenantSettingsResponse> {
  const res = await page.request.get(`${BFF_URL}/tenants/settings`);
  return readSettingsResponse(res, 'get tenant settings');
}

export async function updateTenantSettings(
  page: Page,
  body: UpdateTenantSettingsRequest,
): Promise<TenantSettingsResponse> {
  const res = await page.request.patch(`${BFF_URL}/tenants/settings`, { data: body });
  return readSettingsResponse(res, 'update tenant settings');
}

// Full-settings snapshot -> PATCH body, used to restore a tenant to its pre-test state in
// afterEach. Tenant settings are shared, tenant-wide state (unlike a service/booking a test
// creates itself), so any test that mutates them must put them back.
export function toUpdateRequest(
  settings: TenantSettingsResponse['settings'],
): UpdateTenantSettingsRequest {
  return {
    settings: {
      loyalty: settings.loyalty,
      booking: settings.booking,
      businessHours: settings.businessHours,
      localization: settings.localization,
      notification: settings.notification,
      businessInfo: settings.businessInfo,
    },
  };
}
