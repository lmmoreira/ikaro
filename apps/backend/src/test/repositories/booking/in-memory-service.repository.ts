import {
  IServiceRepository,
  ServiceFilters,
} from '../../../contexts/booking/application/ports/service-repository.port';
import { Service } from '../../../contexts/booking/domain/service.aggregate';

export class InMemoryServiceRepository implements IServiceRepository {
  private readonly store = new Map<string, Service>();

  async findById(id: string, tenantId: string): Promise<Service | null> {
    return this.lookup(id, tenantId);
  }

  // No real locking in-memory — this double only needs to satisfy the port shape for use-case
  // unit tests, none of which exercise concurrent access. Routes through the same private
  // lookup() as findById() (never calls findById() itself) so a spy on either public method never
  // observes a call to the other — callers asserting "findByIdForUpdate, not findById" stay
  // meaningful against this double.
  async findByIdForUpdate(id: string, tenantId: string): Promise<Service | null> {
    return this.lookup(id, tenantId);
  }

  private lookup(id: string, tenantId: string): Service | null {
    const service = this.store.get(id);
    return service?.tenantId === tenantId ? service : null;
  }

  async findByIds(ids: string[], tenantId: string): Promise<Service[]> {
    return ids
      .map((id) => this.store.get(id))
      .filter((s): s is Service => s?.tenantId === tenantId);
  }

  async findAllByTenant(tenantId: string, filters: ServiceFilters = {}): Promise<Service[]> {
    if (filters.ids && filters.ids.length === 0) return [];
    let all = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    if (filters.ids) all = all.filter((s) => filters.ids!.includes(s.id));
    if (filters.status === 'ACTIVE') all = all.filter((s) => s.isActive);
    if (filters.status === 'INACTIVE') all = all.filter((s) => !s.isActive);
    if (filters.search) {
      const search = filters.search.toLowerCase();
      all = all.filter((s) => s.name.toLowerCase().includes(search));
    }
    return all;
  }

  async save(service: Service): Promise<void> {
    this.store.set(service.id, service);
  }
}
