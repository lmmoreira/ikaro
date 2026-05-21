import { IServiceRepository } from '../../../contexts/booking/application/ports/service-repository.port';
import { Service } from '../../../contexts/booking/domain/service.aggregate';

export class InMemoryServiceRepository implements IServiceRepository {
  private readonly store = new Map<string, Service>();

  async findById(id: string, tenantId: string): Promise<Service | null> {
    const service = this.store.get(id);
    if (service?.tenantId !== tenantId) return null;
    return service;
  }

  async findAllByTenant(tenantId: string, onlyActive = false): Promise<Service[]> {
    const all = Array.from(this.store.values()).filter((s) => s.tenantId === tenantId);
    return onlyActive ? all.filter((s) => s.isActive) : all;
  }

  async save(service: Service): Promise<void> {
    this.store.set(service.id, service);
  }
}
