import {
  ILoyaltyCustomerPort,
  LoyaltyCustomerTenantPair,
} from '../../contexts/loyalty/application/ports/loyalty-customer.port';
import { LoyaltyCustomerNotFoundInTenantError } from '../../contexts/loyalty/domain/errors/loyalty-domain.error';

export class InMemoryLoyaltyCustomerPort implements ILoyaltyCustomerPort {
  private readonly links = new Map<string, string>();
  private readonly knownHomeIdentities = new Set<string>();

  seed(
    homeCustomerId: string,
    homeTenantId: string,
    targetTenantId: string,
    targetCustomerId: string,
  ): void {
    this.links.set(`${homeTenantId}:${homeCustomerId}:${targetTenantId}`, targetCustomerId);
    this.knownHomeIdentities.add(`${homeTenantId}:${homeCustomerId}`);
  }

  // Registers a home identity with no cross-tenant links — for tests that only need
  // resolveAllTenantsByOAuthId() to succeed for the home tenant itself.
  seedHome(customerId: string, tenantId: string): void {
    this.knownHomeIdentities.add(`${tenantId}:${customerId}`);
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

  async resolveAllTenantsByOAuthId(
    homeCustomerId: string,
    homeTenantId: string,
  ): Promise<LoyaltyCustomerTenantPair[]> {
    if (!this.knownHomeIdentities.has(`${homeTenantId}:${homeCustomerId}`)) {
      throw new LoyaltyCustomerNotFoundInTenantError();
    }
    const prefix = `${homeTenantId}:${homeCustomerId}:`;
    const pairs: LoyaltyCustomerTenantPair[] = [
      { tenantId: homeTenantId, customerId: homeCustomerId },
    ];
    for (const [key, customerId] of this.links) {
      if (key.startsWith(prefix)) {
        pairs.push({ tenantId: key.slice(prefix.length), customerId });
      }
    }
    return pairs;
  }

  clear(): void {
    this.links.clear();
    this.knownHomeIdentities.clear();
  }
}
