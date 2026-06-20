import type { TenantSettingsProps } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';

export const TENANT_SETTINGS_PORT = Symbol('ITenantSettingsPort');

export interface ITenantSettingsPort {
  getSettings(tenantId: string): Promise<TenantSettingsProps>;
}
