import type {
  BillingTenantInfo,
  IBillingPlatformPort,
} from '../../contexts/billing/application/ports/billing-platform.port';
import { BillingTenantNotFoundError } from '../../contexts/billing/domain/errors/billing-domain.error';

export class InMemoryBillingPlatformPort implements IBillingPlatformPort {
  private readonly tenants = new Map<string, BillingTenantInfo>();
  private nextError: unknown = null;
  readonly lookups: string[] = [];

  seed(info: BillingTenantInfo): void {
    this.tenants.set(info.tenantId, info);
  }

  /** The next lookup rejects with this (a transient failure), then the double recovers. */
  failNext(error: unknown): void {
    this.nextError = error;
  }

  async getTenantInfo(tenantId: string): Promise<BillingTenantInfo> {
    this.lookups.push(tenantId);
    if (this.nextError !== null) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    const info = this.tenants.get(tenantId);
    if (!info) throw new BillingTenantNotFoundError(tenantId);
    return info;
  }
}
