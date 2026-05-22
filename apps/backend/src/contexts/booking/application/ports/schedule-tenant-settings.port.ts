import { BusinessHours } from '../../../platform/domain/value-objects/tenant-settings.vo';

export const SCHEDULE_TENANT_SETTINGS_PORT = Symbol('IScheduleTenantSettingsPort');

export interface IScheduleTenantSettingsPort {
  getBusinessHours(tenantId: string): Promise<BusinessHours>;
}
