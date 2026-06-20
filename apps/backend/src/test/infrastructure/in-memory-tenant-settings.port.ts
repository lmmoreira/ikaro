import {
  TenantSettings,
  TenantSettingsProps,
} from '../../contexts/platform/domain/value-objects/tenant-settings.vo';
import { ITenantSettingsPort } from '../../shared/ports/tenant-settings.port';

export class InMemoryTenantSettingsPort implements ITenantSettingsPort {
  private readonly store = new Map<string, TenantSettingsProps>();
  private defaultSettings: TenantSettingsProps = TenantSettings.default().toJSON();

  set(tenantId: string, settings: TenantSettingsProps): void {
    this.store.set(tenantId, settings);
  }

  setDefault(settings: TenantSettingsProps): void {
    this.defaultSettings = settings;
  }

  async getSettings(tenantId: string): Promise<TenantSettingsProps> {
    return this.store.get(tenantId) ?? this.defaultSettings;
  }
}
