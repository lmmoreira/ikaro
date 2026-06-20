export const TENANT_COUNTRY_PORT = Symbol('TENANT_COUNTRY_PORT');

export interface ITenantCountryPort {
  getCountryCode(tenantId: string): Promise<string>;
}
