import {
  ITenantLocalizationPort,
  TenantLocalization,
} from '../../contexts/booking/application/ports/tenant-localization.port';

const DEFAULT_LOCALIZATION: TenantLocalization = {
  currency: 'BRL',
  locale: 'pt-BR',
  countryCode: 'BR',
};

export class InMemoryTenantLocalizationPort implements ITenantLocalizationPort {
  private readonly store = new Map<string, TenantLocalization>();
  private defaultLocalization: TenantLocalization = { ...DEFAULT_LOCALIZATION };

  set(tenantId: string, localization: TenantLocalization): void {
    this.store.set(tenantId, { ...localization });
  }

  setDefault(localization: TenantLocalization): void {
    this.defaultLocalization = { ...localization };
  }

  async getLocalization(tenantId: string): Promise<TenantLocalization> {
    return { ...(this.store.get(tenantId) ?? this.defaultLocalization) };
  }
}
