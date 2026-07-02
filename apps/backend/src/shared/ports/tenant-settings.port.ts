import type { TenantSettingsData } from '../value-objects/tenant-settings-data';

export const TENANT_SETTINGS_PORT = Symbol('ITenantSettingsPort');

export interface ITenantSettingsPort {
  getSettings(tenantId: string): Promise<TenantSettingsData>;
}
