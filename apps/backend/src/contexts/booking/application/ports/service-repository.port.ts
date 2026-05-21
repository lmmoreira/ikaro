import { Service } from '../../domain/service.aggregate';

export const SERVICE_REPOSITORY = Symbol('IServiceRepository');

export interface IServiceRepository {
  findById(id: string, tenantId: string): Promise<Service | null>;
  findAllByTenant(tenantId: string, onlyActive?: boolean): Promise<Service[]>;
  save(service: Service): Promise<void>;
}
