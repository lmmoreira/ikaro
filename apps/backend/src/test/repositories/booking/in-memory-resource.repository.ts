import {
  IResourceRepository,
  ListResourcesFilter,
} from '../../../contexts/booking/application/ports/resource-repository.port';
import { Resource } from '../../../contexts/booking/domain/resource.aggregate';

export class InMemoryResourceRepository implements IResourceRepository {
  private store: Resource[] = [];

  async findByTenant(tenantId: string, filter: ListResourcesFilter): Promise<Resource[]> {
    return this.store.filter(
      (r) =>
        r.tenantId === tenantId &&
        (filter.type === undefined || r.type === filter.type) &&
        (filter.isActive === undefined || r.isActive === filter.isActive),
    );
  }

  async findById(id: string, tenantId: string): Promise<Resource | null> {
    return this.store.find((r) => r.id === id && r.tenantId === tenantId) ?? null;
  }

  async findByRefId(refId: string, tenantId: string): Promise<Resource | null> {
    return this.store.find((r) => r.refId === refId && r.tenantId === tenantId) ?? null;
  }

  async save(resource: Resource): Promise<void> {
    const idx = this.store.findIndex((r) => r.id === resource.id);
    if (idx >= 0) {
      this.store[idx] = resource;
    } else {
      this.store.push(resource);
    }
  }

  clear(): void {
    this.store = [];
  }
}
