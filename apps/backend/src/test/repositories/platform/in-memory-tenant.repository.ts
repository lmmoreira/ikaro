import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  ITenantRepository,
  TenantFilters,
} from '../../../contexts/platform/application/ports/tenant-repository.port';
import { Tenant } from '../../../contexts/platform/domain/tenant.aggregate';

export class InMemoryTenantRepository implements ITenantRepository {
  private readonly store = new Map<string, Tenant>();

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    for (const tenant of this.store.values()) {
      if (tenant.slug.value === slug) return tenant;
    }
    return null;
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.store.get(id) ?? null;
  }

  async findByIds(ids: string[]): Promise<Tenant[]> {
    return ids.flatMap((id) => {
      const tenant = this.store.get(id);
      return tenant ? [tenant] : [];
    });
  }

  async findMany(filters: TenantFilters = {}): Promise<Tenant[]> {
    if (filters.ids && filters.ids.length === 0) return [];
    let tenants = Array.from(this.store.values());
    if (filters.ids) tenants = tenants.filter((t) => filters.ids!.includes(t.id));
    if (filters.status === 'ACTIVE') tenants = tenants.filter((t) => t.isActive);
    if (filters.status === 'INACTIVE') tenants = tenants.filter((t) => !t.isActive);
    if (filters.name) {
      const search = filters.name.toLowerCase();
      tenants = tenants.filter((t) => t.name.toLowerCase().includes(search));
    }
    if (filters.slug) tenants = tenants.filter((t) => t.slug.value === filters.slug);
    const offset = filters.offset ?? 0;
    const end = filters.limit === undefined ? undefined : offset + filters.limit;
    return tenants.slice(offset, end);
  }

  async findAllActive(): Promise<Tenant[]> {
    return [...this.store.values()].filter((t) => t.isActive);
  }

  async save(tenant: Tenant): Promise<void> {
    this.store.set(tenant.id, tenant);
    await drainDomainEvents(tenant, this.outboxPublisher);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    for (const tenant of this.store.values()) {
      if (tenant.slug.value === slug) return true;
    }
    return false;
  }
}
