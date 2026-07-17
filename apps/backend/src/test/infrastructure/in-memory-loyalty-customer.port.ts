import { ILoyaltyCustomerPort } from '../../contexts/loyalty/application/ports/loyalty-customer.port';
import { LoyaltyCustomerNotFoundInTenantError } from '../../contexts/loyalty/domain/errors/loyalty-domain.error';

export class InMemoryLoyaltyCustomerPort implements ILoyaltyCustomerPort {
  private readonly links = new Map<string, string>();

  seed(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
    targetCustomerId: string,
  ): void {
    this.links.set(`${homeTenantId}:${homeCustomerId}:${targetTenantId}`, targetCustomerId);
  }

  async resolveCustomerIdByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
  ): Promise<string> {
    const match = this.links.get(`${homeTenantId}:${homeCustomerId}:${targetTenantId}`);
    if (!match) throw new LoyaltyCustomerNotFoundInTenantError();
    return match;
  }

  clear(): void {
    this.links.clear();
  }
}
