import { BusinessHours } from '../../contexts/platform/domain/value-objects/tenant-settings.vo';
import { IScheduleTenantSettingsPort } from '../../contexts/booking/application/ports/schedule-tenant-settings.port';

// Default mirrors the seed tenant: Mon–Sat open, Sunday closed.
const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: { open: '09:00', close: '17:00' },
  sunday: null,
};

export class InMemoryScheduleTenantSettingsPort implements IScheduleTenantSettingsPort {
  private readonly store = new Map<string, BusinessHours>();
  private defaultHours: BusinessHours = { ...DEFAULT_BUSINESS_HOURS };

  setBusinessHours(tenantId: string, hours: BusinessHours): void {
    this.store.set(tenantId, hours);
  }

  setDefaultHours(hours: BusinessHours): void {
    this.defaultHours = hours;
  }

  async getBusinessHours(tenantId: string): Promise<BusinessHours> {
    return this.store.get(tenantId) ?? this.defaultHours;
  }
}
