import { ITenantCountryPort } from '../../contexts/customer/application/ports/tenant-country.port';

export class InMemoryTenantCountryPort implements ITenantCountryPort {
  private readonly store = new Map<string, string>();
  private defaultCountryCode = 'BR';

  set(tenantId: string, countryCode: string): void {
    this.store.set(tenantId, countryCode);
  }

  setDefault(countryCode: string): void {
    this.defaultCountryCode = countryCode;
  }

  async getCountryCode(tenantId: string): Promise<string> {
    return this.store.get(tenantId) ?? this.defaultCountryCode;
  }
}
