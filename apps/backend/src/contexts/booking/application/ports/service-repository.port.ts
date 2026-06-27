import { Service } from '../../domain/service.aggregate';

export const SERVICE_REPOSITORY = Symbol('IServiceRepository');

export type ServiceStatusFilter = 'ACTIVE' | 'INACTIVE' | 'ANY';

export interface ServiceFilters {
  ids?: string[];
  status?: ServiceStatusFilter;
  search?: string;
}

export interface IServiceRepository {
  findById(id: string, tenantId: string): Promise<Service | null>;
  findByIds(ids: string[], tenantId: string): Promise<Service[]>;
  findAllByTenant(tenantId: string, filters?: ServiceFilters): Promise<Service[]>;
  save(service: Service): Promise<void>;
}
