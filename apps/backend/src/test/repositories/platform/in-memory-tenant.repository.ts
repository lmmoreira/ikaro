import { ITenantRepository } from '../../../contexts/platform/application/ports/tenant-repository.port';
import { Tenant } from '../../../contexts/platform/domain/tenant.aggregate';

export class InMemoryTenantRepository implements ITenantRepository {
  private readonly store = new Map<string, Tenant>();

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

  async save(tenant: Tenant): Promise<void> {
    this.store.set(tenant.id, tenant);
  }

  async existsBySlug(slug: string): Promise<boolean> {
    for (const tenant of this.store.values()) {
      if (tenant.slug.value === slug) return true;
    }
    return false;
  }
}
