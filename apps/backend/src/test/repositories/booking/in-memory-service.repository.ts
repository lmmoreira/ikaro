import {
  IServiceRepository,
  ServiceFilters,
} from '../../../contexts/booking/application/ports/service-repository.port';
import { Service } from '../../../contexts/booking/domain/service.aggregate';

export class InMemoryServiceRepository implements IServiceRepository {
  private readonly store = new Map<string, Service>();

  async findById(id: string, tenantId: string): Promise<Service | null> {
    const service = this.store.get(id);
    if (service?.tenantId !== tenantId) return null;
    return service;
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
