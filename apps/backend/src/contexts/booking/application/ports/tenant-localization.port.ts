export const TENANT_LOCALIZATION_PORT = Symbol('TENANT_LOCALIZATION_PORT');

export interface TenantLocalization {
  currency: string;
  locale: string;
  countryCode: string;
}

export interface ITenantLocalizationPort {
  getLocalization(tenantId: string): Promise<TenantLocalization>;
}
