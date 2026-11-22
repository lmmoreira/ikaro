import type {
  BillingTenantCursor,
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

  /** Forgets every seeded tenant (a spec that lists the double across tests starts each from none). */
  clear(): void {
    this.tenants.clear();
  }

  /** The next lookup rejects with this (a transient failure), then the double recovers. */
  failNext(error: unknown): void {
    this.nextError = error;
  }

  async listTenantsCreatedBefore(
    cutoff: Date,
    limit: number,
    after?: BillingTenantCursor,
  ): Promise<BillingTenantInfo[]> {
    return [...this.tenants.values()]
      .filter((t) => t.createdAt.getTime() < cutoff.getTime())
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() || a.tenantId.localeCompare(b.tenantId),
      )
      .filter(
        (t) =>
          after === undefined ||
          t.createdAt.getTime() > after.createdAt.getTime() ||
          (t.createdAt.getTime() === after.createdAt.getTime() && t.tenantId > after.id),
      )
      .slice(0, limit);
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
